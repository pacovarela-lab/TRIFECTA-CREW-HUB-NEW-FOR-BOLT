# Export de migración (solo lectura) del backend actual

Objetivo: generar un paquete completo y determinista para que el equipo de Bolt lo importe en el nuevo backend. No se escribe, modifica ni despliega nada en el backend actual, y no se toca el destino.

## Lo que ya confirmé leyendo producción

- 43 tablas y 1 vista en `public`; 41 funciones, 53 triggers, 135 políticas de acceso.
- 10 usuarios registrados; 9 asignaciones de rol; 10 perfiles.
- 2 almacenes de archivos, ambos privados: `estimate-images` (59 archivos, 3.2 MB) y `receipts` (60 archivos, 40.7 MB) — 119 archivos, 43.9 MB en total.
- Base financiera actual: gastos 814 registros, $247,458.45; cobros 71 registros, $303,230.12; movimientos de banco 968, $13,019.85; asistencias 1; trabajos 30; presupuestos 56.

## Qué se va a producir

Carpeta `migration-export/` dentro del proyecto:

```text
migration-export/
  README-MIGRATION.md
  database/
    manifest.json              orden de importación y dependencias
    <tabla>.json               un archivo por tabla, orden estable por id
    schema.sql                 esquema, enums, funciones, triggers, políticas
  auth/
    auth-users-manifest.json   id, email, fechas, proveedor, metadata (sin contraseñas)
    migration-capability.md
  storage/
    storage-manifest.json      bucket, ruta exacta, tamaño, tipo, fecha
    objects/                   archivos descargados con la misma ruta
  validation/
    source-row-counts.json
    financial-baseline.json    totales por empresa y por moneda
    fk-validation.json
  runtime/
    runtime-state-manifest.md
    required-secret-names.md   solo nombres y para qué sirve cada uno
    cron-manifest.md
```

## Cómo se hace

1. Inventario completo leído de producción (tablas, vistas, conteos, funciones, triggers, políticas, extensiones, cron, funciones desplegadas).
2. Exportación tabla por tabla en páginas de 1000 filas, conservando identificadores, empresa, usuario, fechas, valores nulos, JSON, enums y monedas sin transformar. La vista `project_financial_ledger` se documenta como vista, no como tabla.
3. Base financiera exacta antes y después del volcado, para que la reconciliación cierre en $0.00.
4. Auth: se exporta la lista de usuarios con sus identificadores y relaciones (perfiles, roles, trabajadores, columnas `created_by`/`user_id`). Las contraseñas están en un esquema que este entorno no expone, así que la clasificación esperada es **B — identificadores preservados, restablecimiento de contraseña requerido**; se confirmará con evidencia y, si resulta ser otra, se documenta como tal.
5. Archivos: descarga de los 119 objetos con su ruta exacta; si algún archivo no se puede descargar, queda listado en el manifiesto con su ruta de recuperación.
6. Datos transitorios (`notification_outbox`, `email_send_attempts`, `estimate_analysis_runs`, estados de OAuth): cada uno con recomendación COPIAR / OMITIR / SOLO ARCHIVO, ninguno se descarta en silencio.
7. Estado que no vive en el repositorio: configuración de Auth, Google OAuth, almacenamiento, cron, nombres de secretos, funciones desplegadas, correo, pasarela de IA y Twilio. Solo nombres y propósito, nunca valores.
8. Validación final: conteos exportados contra conteos de origen, consistencia de llaves foráneas, empresa preservada, inventario de archivos completo, y confirmación de que no hubo ninguna escritura en el origen.

## Entrega

El paquete queda dentro del proyecto en `migration-export/`, versionado, para que Bolt lo tome directo del repositorio. Si algún componente no se puede exportar desde aquí, se marca solo ese como bloqueado y el resto continúa.

## Detalle técnico

- Toda la lectura se hace con consultas de solo lectura y la API de descarga de archivos; sin migraciones, sin `run_sql` de escritura, sin despliegues, sin cambios de secretos.
- El esquema se reconstruye desde `information_schema`/`pg_catalog` más los archivos ya existentes en `supabase/migrations/`, marcando cualquier diferencia entre repositorio y producción.
- Paginación determinista `order by id` con `limit/offset` para que el export sea reproducible.
- Objetos de almacenamiento descargados vía URLs firmadas de solo lectura; sin borrar ni sobrescribir nada en el origen.
