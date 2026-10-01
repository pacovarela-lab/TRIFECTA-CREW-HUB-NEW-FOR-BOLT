# AI Scan Quality Baseline — Foto de presupuesto AI

- **Fecha:** 2026-09-06 (UTC)
- **Modelo evaluado:** `google/gemini-2.5-flash` (sin cambios en esta iteración)
- **Backend de origen de los casos:** `jejuyjesfhwkzfgfuozb` (solo lectura)
- **Comando:** `npm run estimate-ai:benchmark`
- **Fixtures:** 18 casos (6 derivados de estimates QA/TEST reales + 7 críticos A–G + 5 de la categoría
  "manuscrito con costo interno impreso", etiquetados `printed-planned-cost`: 1 real
  (`real-photo`, escaneo QA manuscrito con columna COST leída en producción) y 4
  `synthetic-pending-real-photo`)

- **Sin PII:** los fixtures no contienen nombres de clientes, direcciones, teléfonos, correos, ids reales ni fotos.

## Cómo se construyó

Los casos derivados provienen de estimates `source_type = photo_ai` con título QA/TEST que ya
tienen extracción AI + revisión humana. La lectura de la IA se toma de los valores originales
(`description_original`, valores previos a la corrección humana) y la verdad dorada del estado
confirmado por la persona. Todo se sanitizó y se versionó como datos puros; el benchmark no
llama al gateway ni a la base de datos.

## Regla de emparejamiento de partidas (determinista)

Cada fila de la IA lleva en el fixture una clave `goldenKey` fijada a mano contra la fila
confirmada por la persona (o `null` si la IA la inventó). No hay fuzzy, ni stemming, ni
similitud semántica: el emparejamiento es 1:1 y determinista.

- Una fila de la IA nunca puede satisfacer dos filas doradas (`Paint` frente a `Paint walls` +
  `Paint ceiling` = 1 match + 1 missing, con `description` marcada como wrong).
- Dos filas de la IA que reclaman la misma fila dorada: la segunda cuenta como alucinación.
- `goldenKey = null` = alucinación. Fila dorada sin emparejar = missing.
- Un valor emparejado pero distinto se reporta como `wrong`; el matching nunca lo oculta.

## Definición de métricas

| Métrica | Definición |
| --- | --- |
| exact | El valor de la IA es idéntico al confirmado |
| normalized | Igual tras trim + minúsculas + colapso de espacios + puntuación básica (sin fuzzy) |
| wrong | Valor legible pero distinto |
| missing | La IA no entregó valor (null) — nunca se convierte a 0 |
| unreadable | La IA marcó el valor como ilegible |
| Total accuracy | % de casos con `charge_amount` correcto; los casos de conflicto son correctos solo si se detectó el conflicto |
| Monetary accuracy | % exact sobre total global + `client_price` + `planned_cost` |
| Item completeness | partidas emparejadas / partidas esperadas |
| Missing item | existe en golden, la IA no la extrajo |
| Hallucinated item | la IA creó una partida inexistente (no se oculta con matching agresivo) |
| Text accuracy | (exact + normalized) sobre `description`, `unit`, `item_type` |
| Overall extraction accuracy | (exact + normalized) sobre todos los campos evaluados; **siempre se publica junto a Total accuracy** |
| Human review load | campos que la persona tuvo que atender, por prioridad alta/media/baja |
| Learned Corrections | capa separada: disponibles / aceptadas / rechazadas / conflictos / hits exactos. Nunca suma a la precisión de la IA |

## Baseline

| Indicador | Valor |
| --- | --- |
| Casos | 18 |
| Overall extraction accuracy | 89.1 % |
| **Total (charge_amount) accuracy** | **100 % (18/18)** — 0 wrong, 0 missing |
| Conflictos de total | 1/1 detectados |
| Monetary field accuracy | 78.4 % |
| Item completeness | 97.6 % (40/41) |
| Missing items | 1 |
| Hallucinated items | 2 |
| Text accuracy | 94.2 % |
| Human review load | 26 alta / 6 media / 2 baja (34) |
| Learned Corrections | 2 disponibles · 1 aceptada · 0 rechazadas · 0 conflictos · 2 hits exactos |
| Latencia AI (media / mediana) — **observada/histórica** | 7 878 ms / 6 551 ms (cobertura 18/18) |
| Latencia total (media / mediana) — **observada/histórica** | 10 942 ms / 9 650 ms (cobertura 18/18) |
| Llamadas Gemini / intentos | 19 / 19 |


### Precisión por campo

| Campo | exact/normalized | wrong | missing | unreadable | n |
| --- | --- | --- | --- | --- | --- |
| description | 85 % | 6 | 0 | 0 | 40 |
| quantity | 100 % | 0 | 0 | 0 | 40 |
| unit | 100 % | 0 | 0 | 0 | 40 |
| client_price | 97.5 % | 0 | 0 | 1 | 40 |
| planned_cost | 50 % | 1 | 18 | 1 | 40 |
| item_type | 97.5 % | 1 | 0 | 0 | 40 |

## Latencia

Los tiempos provienen de corridas históricas ya registradas; no se hicieron llamadas nuevas al
modelo para completar datos. Media y mediana se calculan solo sobre los casos con dato
disponible (18/18 en esta baseline); los faltantes nunca se imputan.

## Problemas conocidos

0. **La categoría `printed-planned-cost` ya tiene un caso real.** `cost-real-handwritten-column`
   proviene de un escaneo QA manuscrito real (nota manuscrita con columna `COST`) hecho contra la
   función desplegada: la IA leyó total 1 950 y los tres costos internos (400 / 200 / 90) sin
   copiar el precio del cliente. Los otros 4 casos siguen siendo sintéticos
   (`synthetic-pending-real-photo`) y modelan encabezado de columna, abreviaturas `mat`/`lab`,
   costo impreso ilegible (nulo, nunca 0) y la prohibición de copiar el precio del cliente.
1. **`planned_cost` sigue siendo el campo más débil (50 %).** En documentos sin columna de costo la
   IA no puede leerlo; genera la mayor parte de la carga de revisión humana.

2. **`description` 77.8 %.** Fallas por abreviaturas (`Demo` → `Demolition`) y reescrituras humanas.
   Learned Corrections cubre parte de esto, pero se reporta aparte.
3. **Alucinaciones: 2** (una fila extra en un caso con reintento y una partida inventada en el caso crítico E).
4. **Un reintento** eleva mucho la latencia (31 s frente a ~6–7 s de una sola llamada).
5. **Dataset pequeño y poco variado**: solo existen estimates QA/TEST con fotos sintéticas de una
   página. No hay manuscritos difíciles reales ni documentos multipágina etiquetados QA.

## Comparación futura (informativa, no bloquea CI)

```
npm run estimate-ai:benchmark -- --compare-baseline docs/estimate-ai-quality-baseline.snapshot.json
```

Archivos versionados: `docs/estimate-ai-quality-baseline.json` (resumen completo) y
`docs/estimate-ai-quality-baseline.snapshot.json` (indicadores para comparar antes/después).
