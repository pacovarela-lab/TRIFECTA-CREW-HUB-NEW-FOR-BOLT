# Crew Hub — Estado maestro del proyecto

> Fuente operativa para retomar el proyecto y actualizar en el mismo PR después de cada PR o deploy importante. No incluir secrets, tokens, claves, contenido sensible de clientes ni PII innecesaria.

## Estado actual

- **Producto:** Crew Hub (nombre histórico: Trifecta Crew Hub).
- **Repositorio autorizado:** `pacovarela-lab/trifecta-flow-pro`.
- **Producción:** <https://trifectaportal.app>.
- **Proyecto Supabase de producción autorizado:** `jejuyjesfhwkzfgfuozb`. Nunca consultar, usar ni modificar el proyecto Supabase legacy/prohibido.
- **Estado de producción:** operativo y estable.
- **Tenant interno:** Trifecta Home Improvement, con herramientas administrativas especiales.
- **Photo AI Estimate (Foto de presupuesto AI):** V1 DEPLOYED AND VERIFIED en producción el 2026-08-29, incluido el fix P0 posterior a la aprobación.
- **Trabajo paralelo permitido:** Tester Round 2 puede continuar mientras Foundation se desarrolla en otra rama.

## SHAs y despliegue

| Referencia | Valor | Estado |
| --- | --- | --- |
| Último frontend relevante en producción | `025fef9e1703a7d25b618a2e7d3499900e8e3417` | PR #12, squash, desplegado |
| Bundle observado en producción | `/assets/index-Be6cpx73.js` | Desplegado |
| SHA auditado para Photo AI Estimate | `025fef9e1703a7d25b618a2e7d3499900e8e3417` | Auditoría Codex completada |
| HEAD local al crear este documento | `7a7fceef769f47bf125ab3288a5176780908414c` | No equivale al baseline desplegado |
| Base de Foundation | `025fef9e1703a7d25b618a2e7d3499900e8e3417` | Rama `feature/estimate-photo-foundation`; pendiente de merge |
| Commit de implementación Foundation | `bc7de9e289a74dd0505e2478b9264fd2f72c9f20` | PR #13; no desplegado |

Al crear este documento, el checkout local ya tenía cambios ajenos sin confirmar. Este archivo no afirma que esos cambios estén desplegados ni validados.

## Decisiones inmutables y guardrails

### Seguridad, tenancy y producción

- Todo dato debe permanecer aislado por `company_id`.
- RLS y tenant isolation están implementados y probados.
- Prohibido introducir consultas cross-tenant, usar `service_role` en frontend o asociar recursos de compañías distintas.
- Solo el administrador global designado tiene acceso cross-tenant. Otros administradores de Trifecta no lo heredan.
- El tenant externo no puede acceder a Bank, Ledger, Audit, imports internos ni Feedback Operations. `/import` está protegido por `InternalToolGuard`.
- No registrar imágenes, data URLs, prompts completos, PII innecesaria ni contenido manuscrito sensible.

### Finanzas

- Baseline obligatorio de V10: **delta = $0.00**, salvo cambio financiero expresamente autorizado.
- No inventar líneas financieras.
- **Estimated financials != actual financials.**
- Nunca convertir materiales estimados en `expenses`, labor estimada en `worker_checkins`, estimados en ledger ni cobros previstos en `payments`.
- No modificar `useProjectFinancials` como parte de Photo AI Estimate.

### Modelo organizativo

- `business_units` y `divisions` son conceptos distintos y nunca deben confundirse.
- Trifecta tiene exactamente estas Business Areas: Home Improvement, Roofs, Landscaping y Junk Removal.
- Los prospect tenants no heredan esas áreas.
- `projects.business_unit_id` es nullable.
- En la UI, Business Area se presenta como **Tipo de trabajo**.

### Producto y lenguaje

- Branding externo: **Crew Hub**.
- Usuario objetivo: pequeño contratista o handyman latino en EE. UU., mobile-first, con poca experiencia administrativa, solo o con ayudantes.
- Filosofía: **El contratista hace el trabajo. Crew Hub hace la administración.**
- Promesa principal: **“Deja de adivinar si un trabajo te dejó dinero: Crew Hub te muestra cuánto ganaste realmente.”**
- Conceptos principales: Trabajos, Gastos, Cobros, Ayudantes y Ganancia. No vender “project management”.
- Principio de interacción: si algo necesita explicación, cuenta como fricción; las acciones frecuentes deben requerir como máximo 3 toques.
- UI externa usa Trabajo/Trabajos; el schema y las rutas internas pueden conservar `project/projects`.

## Arquitectura vigente

### Tenancy, trial y onboarding

- Trial real: 30 días. Trifecta tiene `trial_exempt = true`.
- Tras expirar, un tenant externo conserva reads y tiene writes bloqueados mediante enforcement backend.
- Copy vigente: **“Te quedan N días de prueba”**. No volver a “Trial — N days remaining”.
- `create_company_for_current_user(...)` permite crear company, profile, admin role, división General, timezone, trial, Business Areas opcionales y primer trabajo.
- Onboarding visible reducido a: nombre del negocio, tipos de trabajo y primer trabajo. La división General se crea internamente.

### Home y flujos principales

- Home muestra Hoy, Trabajos activos, Cobraste, Gastaste, Te deben y Te quedó.
- Crear Trabajo: nombre obligatorio; tipo, monto y dirección opcionales; división automática si solo existe General.
- “¿Cuánto vas a cobrar?” representa el importe esperado del cliente.
- Flujo móvil central permite gasto, recibo, dictado, pago y mano de obra.

### Mano de obra y reportes

- Ruta: `/checkins`; componente: `src/pages/Checkins.tsx`.
- La UI usa Ayudantes o Equipo según contexto; Reports está en español.
- Fuentes reales: `worker_checkins` y `expenses`, con clasificación compartida de labor.
- Hooks vigentes: `useCheckins`, `useExpenses` y `useProjectFinancials`.
- Agrupación por Trabajo; muestra Trabajo, Ayudante, fecha, horas cuando existen, costo y total. Horas y costos permanecen separados.

### SMS, Calendar, receipts y feedback

- Toll-Free aprobado: `+1 833 808 7060`. Trifecta tiene `sms_enabled = true`; prospect tenants, `false`.
- `TASK_ASSIGNED_SMS` solo se genera al crear con worker o ante un cambio real de worker. Reprogramar no genera otro SMS. No tocar salvo regresión.
- Google Calendar funciona en producción para la cuenta operativa designada; create/update/cancel fue probado. No cambiar OAuth/scopes salvo regresión y no agregar Gmail scopes.
- El branding de Google login gestionado por Lovable es un pendiente separado: **AUTH BRANDING CONFIGURATION REQUIRED**. No mezclarlo con Calendar OAuth.
- Receipts soporta foto, HEIC/HEIF, compresión, OCR, review, idempotencia, offline queue y migración legacy `schemaVersion: 2`.
- El contador que provocaba 406 mediante HEAD/count está corregido; no alterar OCR/offline sin una necesidad concreta.
- Feedback usa `product_feedback`, workflow `new → reviewing → fixed → closed`, inbox `/feedback` y la Edge Function `feedback-alert-send`. El pipeline de correo e idempotencia fue validado en producción.

## Photo AI Estimate — contrato de producto

### Alcance V1

- Entrada online-only de 1–5 fotos de una hoja manuscrita, en español o Spanglish.
- Flujo: foto → extracción → preguntas → corrección → cálculos → riesgo → recomendaciones → revisión → aprobación → estimado interno → versión cliente en inglés → Crear Trabajo.
- V1 no incluye PDF, proveedores, WhatsApp ni Home Depot; son módulos posteriores.
- Puede reutilizar preparación local de imágenes, pero no la offline queue de receipts.
- No entrenar un modelo propio; usar memoria de correcciones por company/user.

### Verdad, incertidumbre y preguntas

- La IA nunca adivina silenciosamente.
- Estados de extracción: `confirmed`, `inferred`, `uncertain`, `unreadable`.
- Cada dato debe poder distinguir `source_text`, `normalized_text`, `value`, `confidence`, `status`, `reason`, `provenance` e `image_index`.
- Provenance: `observed`, `inferred`, `recommended`.
- Importes como strings decimales validadas.
- Nunca autocorregir silenciosamente cifras, cantidades o moneda.
- Si algo afecta dinero o alcance y no está claro, preguntar.
- Debe hacer **exactamente 3 preguntas adaptadas al documento**, una por categoría: qué falta/no está claro, qué costo podría faltar y qué se necesita para comprobar si conviene.

### Rentabilidad y recomendaciones

- Mostrar: Vas a cobrar, Materiales, Mano de obra, Otros gastos, Costo estimado, Te quedaría y Margen estimado.
- Input principal: **¿Cuánto quieres que te quede?** El margen porcentual se calcula.
- Fórmulas puras: `plannedCost = materials + labor + other`, `projectedProfit = chargeAmount - plannedCost`, `projectedMargin = projectedProfit / chargeAmount`.
- Riesgo explicable, no ML: Bajo, Revisar o Alto. Considerar margen, incertidumbre monetaria, costos esenciales, alcance y contingencia.
- Mostrar siempre “Basado en lo que ingresaste…” y como máximo 3 recomendaciones entre Missing scope, Missing cost y Price opportunity.
- Nunca modificar el estimate automáticamente; el usuario decide.

### Separación interno/cliente y aprobación

- Vista interna: costos, planned labor, target profit, margin, risk, recomendaciones, incertidumbres y notas internas.
- Vista cliente: únicamente scope, partidas, cantidades, precios cliente, subtotal, total y términos.
- Nunca exponer al cliente markup, target profit, margen interno, risk, recomendaciones, incertidumbre o notas internas.
- La versión cliente en inglés solo se genera después de `approved`.
- Un estimate aprobado es inmutable; cualquier cambio posterior crea una nueva versión.
- Create Work puede prellenar title, client, address, Business Area y expected charge amount.
- No crear desde el estimate `expenses`, `payments`, `worker_checkins`, ledger entries ni tasks automáticas en V1.

### Base técnica existente y límites

- Reutilizar `estimates` y `estimate_items`; no crear un segundo sistema paralelo.
- Auditar primero el schema legacy real y la semántica de `total`. Si no puede probarse, detenerse con **LEGACY ESTIMATE SEMANTICS BLOCKED**.
- Infraestructura reutilizable: cámara trasera, HEIC/HEIF, resize a 1800 px, JPEG 0.82, límite 10 MB, SHA-256, duplicados, upload privado, OCR multimodal, parse/validation, review/edit/approve e idempotencia.
- Legacy `/import` (`src/pages/ImportEstimate.tsx`, `src/lib/estimateParser.ts`, `src/components/estimates/EstimateItemsEditor.tsx` y hooks en `useTrifectaData.ts`) crea cliente → proyecto → estimate → partidas → tasks. No reutilizar ese acoplamiento para Photo AI.
- IA: Lovable AI Gateway, Edge Functions y Gemini multimodal.
- Endurecimiento requerido: rate limiting, timeout real server-side, validación JSON Schema estricta y logging seguro.
- El documento manuscrito es input no confiable. Deben ignorarse instrucciones embebidas sobre tools, URLs, SQL, modelo, system instructions o acciones.

### Foundation y datos

- Crear bucket privado `estimate-images` con paths `company_id/estimate_id/image_id.ext`, URLs firmadas cortas y retención objetivo de 90 días tras aprobación. El cleanup cron no pertenece todavía al alcance.
- Ampliar las tablas actuales y crear `estimate_images`, `estimate_questions`, `estimate_learned_terms` y `estimate_analysis_runs`.
- Incorporar `estimates`, `estimate_items` y las cuatro tablas nuevas al enforcement existente de trial: expirado permite read y bloquea write; Trifecta exempt sin regresión.
- Members pueden crear estimates. Solo creator, manager o admin pueden aprobar.
- Tres llamadas funcionales: extracción multimodal; recomendaciones después de responder; versión cliente en inglés después de aprobación.
- Preguntas y cálculos son deterministas.
- Analytics permitidos: `estimate_scan_started`, `estimate_scan_completed`, `estimate_review_started`, `estimate_question_answered`, `estimate_approved`, `estimate_created_project`, `estimate_abandoned`. Nunca incluir texto, montos, nombres, direcciones o imágenes.

### Entrega por PRs

1. **Foundation:** schema, RLS, trial, Storage, financial helpers, risk engine, versioning e idempotencia. Sin UI AI.
2. **Captura y análisis:** 1–5 fotos, Edge AI, extracción, incertidumbre, exactamente 3 preguntas, recomendaciones y review.
3. **Aprobación:** snapshot/version, client English preview y Create Work idempotente.

## Pendientes

### Siguiente trabajo

- Revisar y aprobar PR #13 Foundation en `feature/estimate-photo-foundation`.
- Auditoría legacy completada: `estimates.total` es el total comercial esperado del estimate y equivale a la suma de `estimate_items.total` en ambos imports legacy; no representa costos reales.
- Migration Foundation: `20260828120000_estimate_photo_foundation.sql`.
- Después del merge, PR 2 puede implementar captura/análisis sin crear actuals ni un segundo sistema de estimates.

### No bloqueantes conocidos

- Badge `AT RISK` todavía aparece en inglés.
- Algunas alertas dicen `Project "..." has negative profit.`.
- El guard puede mostrar `This feature isn't available for your account.`.
- Un perfil sandbox residual puede producir `406 companies?...` y encabezado `BETA · BETA`; no es el flujo normal de onboarding.
- **AUTH BRANDING CONFIGURATION REQUIRED** para Google login, separado de Calendar OAuth.

### Fuera de alcance de Foundation

- No tocar `expenses`, `payments`, `project_financial_ledger`, `worker_checkins`, `useProjectFinancials`, V10, receipts/OCR/offline queue, Twilio, Calendar/OAuth, feedback/email, Business Areas, divisions ni onboarding.

## Último smoke conocido

| Área | Resultado |
| --- | --- |
| Producción | Operativa |
| PR #12 / frontend | Desplegado |
| Reports / labor | PASS |
| Reconciliación Paul Greenwald | `$11,730` en `/checkins` = `$11,730` en Project Detail |
| Reconciliación Andrea Atala Flooring | `$240` = `$240` |
| Labor source mismatch | NO |
| V10 delta | `$0.00` |
| Critical/High nuevos | `0` |
| Receipts 406 | `0` |
| Feedback email pipeline | VALIDATED; correo recibido físicamente |
| Calendar | Create/update/cancel probado |
| Acciones móviles | Crear Trabajo, gasto, recibo, cobro y ver ganancia en ≤3 toques |
| Foundation migration local | PASS desde cero el 2026-08-28 |
| PR #13 `validate` | PASS en CI el 2026-08-28 (2m36s) |
| PR #13 `supabase-local` | PASS en CI el 2026-08-28 (6m21s), incluido harness Foundation |
| Helpers financieros/risk/path | PASS en CI; ejecución directa local también PASS |

Las cifras financieras visibles en Home durante el smoke de Trifecta fueron solo un snapshot observado y no constituyen un baseline contractual.

## V1 Foto de presupuesto AI — DEPLOYED AND VERIFIED (2026-08-29)

Estado: **DEPLOYED AND VERIFIED** en producción.

| Elemento | Estado |
| --- | --- |
| AI Scan productivo (`estimate-photo-analyze`) | PASS |
| Exactly-three preguntas de revisión | PASS |
| Revisión humana (`save_estimate_human_review`) | PASS |
| Aprobación explícita (`approve_photo_estimate`) | PASS; bloquea con incertidumbre monetaria material |
| Client Estimate Preview (inglés, sin costos internos ni margen) | PASS |
| Create Work (`create_work_from_estimate`) | PASS; sin duplicados |
| MIME enforcement vía Storage RLS (`allowed_mime_types` no configurable) | PASS; JPEG/JPG/PNG/WEBP/HEIC/HEIF |
| Backend | Lovable Cloud `jejuyjesfhwkzfgfuozb`, sin cambios en este cierre |
| V10 delta | `$0.00` |
| Efectos financieros | Cero: `expenses`, `payments`, `worker_checkins` y `project_financial_ledger` sin variación |
| P0 post-aprobación | Corregido |

### P0 corregido

`src/components/estimates/EstimatePhotoReview.tsx`: tras aprobar, `load()` invocaba `initialize_estimate_review_questions`, que devuelve `400 estimate_review_forbidden` en estimates aprobados, dejando la pantalla congelada sin Client Estimate Preview ni Crear Trabajo. Ahora, si el estado es `approved`, las preguntas se leen en modo solo lectura desde `estimate_questions` y no se invoca la RPC de inicialización. Cubierto por `src/lib/__tests__/estimatePhotoApprovedLoad.test.ts`.

### Datos TEST residuales

Existen aproximadamente una docena de estimates `photo_ai` de prueba (varios en estado `approved`, por diseño inmutables) más objetos de Storage asociados. No se eliminan ni se alteran. Opción segura documentada, no aplicada: marcarlos mediante una tabla/columna de anotación externa (por ejemplo un flag `is_test` en una tabla auxiliar o una vista de exclusión para reporting), nunca editando el estimate aprobado ni sus evidencias.

### Pendiente separado

**AUTH BRANDING CONFIGURATION REQUIRED** para Google login. No forma parte de V1 Foto de presupuesto y no se corrige aquí.

## Siguiente paso

Definir el alcance posterior a V1 de Foto de presupuesto (revisiones y métricas de uso) y, en paralelo, resolver el pendiente `AUTH BRANDING CONFIGURATION REQUIRED`.

## Protocolo de actualización

Después de cada PR o deploy importante, actualizar este archivo **en el mismo PR**:

1. Estado actual y entorno afectado.
2. SHA de merge/squash y SHA/bundle desplegado cuando aplique.
3. Nuevas decisiones inmutables o cambios explícitamente autorizados.
4. Arquitectura realmente vigente, no solo la planeada.
5. Pendientes, riesgos y no bloqueantes.
6. Último smoke con fecha, entorno y resultado.
7. Un único siguiente paso accionable.

No registrar secretos ni afirmar que algo está desplegado, probado o aprobado sin evidencia.

## Cierre post-deploy — Hardening Foto de presupuesto AI (2 sep 2026)

Estado: **HARDENING DEPLOYED — REAL TEST PASSED** · **POST-DEPLOY CLOSED**.

| Elemento | Resultado |
| --- | --- |
| SHA base desplegado | `c59c22f208e8a32aef42f6466b37de7116f8a75f` |
| Bundle JS en producción | `/assets/index-BPims2zj.js` (chunk `EstimatePhotoScan-cJke9amC.js`) |
| Bundle CSS en producción | `/assets/index-BpvMoezE.css` |
| Frontend live | Sí — `https://trifectaportal.app`, deployment `118f2891-1066-48b9-8a38-833b12080888` |
| AI Scan | Sin 502; total global correcto (`charge_amount = 6785`, no sobrescrito por precios de partida) |
| Edición / guardado / reload | PASS (persistencia verificada en fixtures) |
| Exactly-three questions | PASS (3 preguntas por estimate en los tres fixtures) |
| Approval blocker | PASS (bloqueo con `charge_amount` sin confirmar y costos pendientes) |
| UI interna en español | PASS · Client Estimate Preview en inglés |
| Gemini | 1 llamada real, 7.1–9.7 s por análisis |
| Delta V10 | `$0.00` |
| Consola | 0 errores nuevos; solo warnings preexistentes `forwardRef` y React Router; sin PII ni secretos |

### Residuos TEST conservados intencionalmente

Se conservan como fixtures reales de regresión hasta terminar la siguiente mejora de UX (no eliminar):

- `81c02467-f804-4a4d-b484-1d4f7d44ecff` — `needs_answers`
- `4c5af943-e790-4322-b8e9-65f7f3e8c985` — `reviewed`
- `3485ee93-433b-4a51-bb22-cc72abc239d6` — `Kitchen Remodel TEST`, `approved`

Ninguno genera registros financieros. El smoke post-deploy no creó residuos nuevos.
