# Orden en gastos: proyecto obligatorio, tareas a socios y pendientes a dos clics

## 1. Nadie puede guardar un gasto sin destino

En todos los puntos donde se captura o edita un gasto, hay que elegir **un trabajo** o marcar **Gasto general**. Si falta, el botón Guardar no procede y aparece un aviso claro en español que dice qué falta.

Aplica en:
- Formulario de gastos (alta y edición).
- Gasto por voz: si la voz no identificó el trabajo, se pide elegirlo antes de guardar.
- Recibos / foto: al convertir el recibo en gasto.
- Conciliación bancaria: al crear o editar un gasto desde un movimiento del banco.

Al marcar **Gasto general** se pide además indicar si se prorratea (gasolina, oficina) para que no quede como pendiente eterno.

## 2. Asignar la corrección como tarea a un socio

En la pantalla de edición de un gasto, un cobro o un movimiento del banco aparece **"Pedir revisión a…"**:
- Eliges a la persona (Arnaldo, Richard u otro miembro).
- Escribes una nota corta opcional ("¿de qué trabajo es este Home Depot?").
- Se crea una tarea sencilla que aparece en la lista de tareas de esa persona, con enlace directo al registro; al abrirlo y completarlo la tarea se cierra.
- Además se le manda aviso por los canales ya configurados (correo; SMS sigue apagado mientras el número Toll-Free esté pendiente).

Tú ves, en tu vista general, cuántas revisiones pediste y cuántas siguen abiertas.

## 3. Pendientes de revisión a dos clics

Arriba en Inicio, una tarjeta fija **"Por revisar"** con tres accesos directos: gastos sin trabajo, cobros sin cliente/trabajo y movimientos del banco pendientes, cada uno con su número. Un toque abre esa lista ya filtrada; el segundo toque abre el registro para corregirlo.

## 4. "Sugeridas 1" que se ve vacía

Hoy existe **un** movimiento sugerido en el sistema, así que el número es correcto y el problema está en la vista. El buscador de la pantalla es compartido entre pestañas (al usar "Ver pendientes de <mes>" queda un texto escrito), y ese texto también filtra Sugeridas, dejándola vacía. Primer paso: confirmarlo en la pantalla real; después, limpiar el buscador al cambiar de pestaña y, si algo queda oculto por la búsqueda, mostrar "N ocultos por la búsqueda — limpiar".

## Detalle técnico

- Nueva tabla `public.review_requests` (company_id, entity_type: expense/payment/bank_tx, entity_id, requested_by, assigned_to, note, status open/done, timestamps) con GRANTs, RLS por empresa y cierre por el asignado o por quien la pidió. No se usa `tasks` porque `tasks.project_id` es NOT NULL y estos registros son justo los que no tienen trabajo.
- Aviso al asignado reutilizando la infraestructura de correo transaccional existente (`send-email` + plantilla nueva); sin tocar Twilio.
- Validación en `ExpenseSheet.tsx` (endurecer el refine actual para exigir también decisión de general/prorrateo), `VoiceExpenseSheet.tsx`, `ReceiptReviewSheet.tsx` y el alta desde `BankReconciliation.tsx`.
- Componente compartido `ReviewRequestButton` usado en las tres hojas de edición; hook nuevo en `useTrifectaData.ts` para crear/listar/cerrar.
- Tarjeta "Por revisar" en `Dashboard.tsx` reutilizando `getExpenseIssueKinds` / `getPaymentIssueKinds` y el conteo de `bank_transactions` pendientes; enlaces a `?filtro=sin-asignar`.
- Arreglo de la pestaña Sugeridas en `BankReconciliation.tsx` (estado de búsqueda por pestaña + aviso de resultados ocultos).
- Sin cambios en cálculos financieros, V10, ledger ni modelo de IA. Pruebas nuevas para la validación de destino y para el filtro por pestaña.
