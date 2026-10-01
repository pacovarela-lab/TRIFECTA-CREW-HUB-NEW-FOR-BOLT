# Filtro "Por revisar" en Gastos y Cobros

Hoy, al tocar "gastos sin asignar" o "cobros sin asignar" en la vista general, la app abre la lista completa. El cambio hace que esos accesos abran ya filtrada la lista, y agrega un filtro propio en cada pantalla.

## Qué cambia

### Vista general (Inicio)
- "N gastos sin asignar" abre Gastos ya filtrado en "Por revisar".
- "N cobros sin asignar" abre Cobros ya filtrado en "Por revisar".

### Gastos
- Un solo botón de filtro arriba: **Por revisar (N)**. Se enciende/apaga con un toque.
- Encendido, muestra únicamente los gastos que necesitan revisión: sin trabajo asignado, fecha futura, mano de obra sin persona identificada, o evidencia pendiente.
- Los gastos generales prorrateados (gasolina, oficina) no cuentan como pendientes y no aparecen en ese filtro.
- Si el filtro está encendido y no queda nada, se muestra "Todo revisado" con la opción de ver todos.

### Cobros
- Mismo botón **Por revisar (N)**.
- Se considera pendiente un cobro sin cliente y sin trabajo asignado, o con fecha futura (misma regla de fecha que en gastos).
- Igual mensaje de "Todo revisado" cuando no queda nada.

## Detalle técnico

- Nuevo helper `getPaymentIssueKinds` en `src/lib/paymentStatus.ts` (sin cliente ni trabajo, fecha futura) con pruebas.
- Reutilizar `getExpenseIssueKinds` / `isProratedOverheadExpense` en `src/pages/Expenses.tsx` para el conteo y el filtro.
- El estado del filtro se lee de la URL (`?filtro=revisar`) para que la navegación desde el panel funcione y el enlace sea compartible; `src/pages/Dashboard.tsx` navega a `/expenses?filtro=revisar` y `/payments?filtro=revisar`.
- Solo cambios de interfaz: sin migraciones, sin tocar cálculos financieros, ledger, V10 ni funciones del backend.
- Pruebas nuevas para el filtro de gastos y el de cobros; se corre la batería completa de Vitest.
