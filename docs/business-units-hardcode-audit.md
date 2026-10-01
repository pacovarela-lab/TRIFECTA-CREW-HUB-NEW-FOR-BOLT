# Auditoría de hardcodes de áreas del negocio

## Corregido

- El encabezado del Dashboard ya no muestra `Trifecta Group` para todos los tenants; usa el nombre de la compañía autenticada.
- La creación, edición, búsqueda y filtros de proyectos consumen `business_units` del tenant autenticado.

## Conservado por compatibilidad

- `divisions` continúa siendo la dimensión contable histórica. No representa áreas configurables y cambiarla alteraría reportes, gastos, pagos y V10.
- `projectNaming.ts` conserva palabras como Roof, Landscaping y Junk Removal: son sugerencias de tipo/nombre de proyecto, no asignaciones de tenant.
- `ImportTrifectaOS.tsx` conserva la resolución explícita de Trifecta/Home Improvement porque es un importador histórico específico. No se usa para onboarding ni para otros tenants.
- Las migraciones históricas conservan nombres anteriores por reproducibilidad. La nueva migración solo agrega seeds condicionales a la compañía existente `Trifecta Home Improvement`.
- Textos de marca y assets de login no participan en permisos, clasificación ni selección de áreas.

## Resultado

No quedan listas operativas de áreas de negocio codificadas en el frontend. Prospect Beta 1, Prospect Beta 2 y compañías futuras comienzan sin áreas predefinidas y pueden crear las suyas desde Settings según sus roles.
