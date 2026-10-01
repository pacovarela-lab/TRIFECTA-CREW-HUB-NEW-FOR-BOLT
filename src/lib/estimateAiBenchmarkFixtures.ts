/**
 * Golden dataset for the AI Scan quality benchmark.
 *
 * Every case is derived from an existing QA/TEST photo estimate in the
 * authorized backend or is a synthetic critical case. All content is
 * sanitized: no client names, addresses, phones, emails, photos or raw OCR
 * text are stored here. Estimate ids are replaced by stable case ids.
 *
 * "ai" = what the extraction produced. "golden" = the human confirmed state.
 */

import { UNREADABLE, type BenchmarkCase } from "./estimateAiBenchmark.ts";

const noReview = { high: 0, medium: 0, low: 0 };

export const ESTIMATE_AI_GOLDEN_DATASET: BenchmarkCase[] = [
  {
    id: "qa-sort-basic",
    label: "QA · 3 partidas, total explícito, costos faltantes",
    tags: ["qa-derived", "single-page", "explicit-total", "missing-costs"],
    golden: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demolicion de muro", quantity: 1, unit: null, client_price: 1200, planned_cost: null, item_type: "scope" },
        { key: "b", description: "Instalacion de piso", quantity: 1, unit: null, client_price: 2400, planned_cost: 1000, item_type: "scope" },
        { key: "c", description: "Pintura interior", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" },
      ],
    },
    ai: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demolicion de muro", quantity: 1, unit: null, client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Instalacion de piso", quantity: 1, unit: null, client_price: 2400, planned_cost: null, item_type: "scope" },
        { goldenKey: "c", description: "Pintura interior", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" },
      ],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6181, totalMs: 9200 },
  },
  {
    id: "qa-learned-hit",
    label: "QA · corrección aprendida disponible en coincidencia exacta",
    tags: ["qa-derived", "learned-corrections"],
    golden: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demolicion de muro", quantity: 1, unit: null, client_price: 1200, planned_cost: null, item_type: "scope" },
        { key: "b", description: "Instalacion de piso", quantity: 1, unit: null, client_price: 2400, planned_cost: null, item_type: "scope" },
        { key: "c", description: "Pintura interior premium", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" },
      ],
    },
    ai: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demolicion de muro", quantity: 1, unit: null, client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Instalacion de piso", quantity: 1, unit: null, client_price: 2400, planned_cost: null, item_type: "scope" },
        { goldenKey: "c", description: "Pintura interior", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" },
      ],
    },
    human_review: { high: 1, medium: 0, low: 1 },
    learned: [{ aiText: "Pintura interior", suggestion: "Pintura interior premium", outcome: "accepted", exactHit: true }],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6789, totalMs: 9800 },
  },
  {
    id: "qa-kitchen-abbrev",
    label: "QA · abreviaturas manuscritas (Demo → Demolition)",
    tags: ["qa-derived", "handwriting-clear", "abbreviations", "explicit-total"],
    golden: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: 700, item_type: "scope" },
        { key: "b", description: "Cabinets", quantity: 1, unit: null, client_price: 2400, planned_cost: 1500, item_type: "material" },
        { key: "c", description: "Paint", quantity: 1, unit: null, client_price: 1200, planned_cost: 400, item_type: "material" },
        { key: "d", description: "Labor", quantity: 1, unit: null, client_price: 2585, planned_cost: 1800, item_type: "labor" },
      ],
    },
    ai: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demo", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Cabinets", quantity: 1, unit: null, client_price: 2400, planned_cost: null, item_type: "material" },
        { goldenKey: "c", description: "Paint", quantity: 1, unit: null, client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "d", description: "Labor", quantity: 1, unit: null, client_price: 2585, planned_cost: null, item_type: "labor" },
      ],
    },
    human_review: { high: 4, medium: 1, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6501, totalMs: 9600 },
  },
  {
    id: "qa-bath-units",
    label: "QA · cantidades y unidades (sqft), sin moneda declarada",
    tags: ["qa-derived", "units", "missing-currency"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { key: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" },
        { key: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 400, item_type: "scope" },
        { key: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: 400, item_type: "scope" },
      ],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: null, item_type: "scope" },
        { goldenKey: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "scope" },
      ],
    },
    human_review: { high: 3, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7063, totalMs: 10100 },
  },
  {
    id: "qa-bath-rewording",
    label: "QA · manuscrito difícil, descripciones reescritas por la persona",
    tags: ["qa-derived", "handwriting-hard", "text-rewrite"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { key: "a", description: "Demolition of tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "labor" },
        { key: "b", description: "Installation of vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 400, item_type: "labor" },
        { key: "c", description: "Painting walls", quantity: 1, unit: null, client_price: 300, planned_cost: 400, item_type: "labor" },
      ],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: null, item_type: "labor" },
        { goldenKey: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: null, item_type: "labor" },
        { goldenKey: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "labor" },
      ],
    },
    human_review: { high: 3, medium: 3, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6079, totalMs: 9100 },
  },
  {
    id: "qa-extra-row-retry",
    label: "QA · fila extra inventada + reintento del gateway",
    tags: ["qa-derived", "hallucination", "retry"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { key: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" },
        { key: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 400, item_type: "scope" },
        { key: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: 400, item_type: "scope" },
      ],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: null,
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: null, item_type: "scope" },
        { goldenKey: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: null, item_type: "scope" },
        { goldenKey: null, description: "Bathroom remodel", quantity: 1, unit: null, client_price: null, planned_cost: null, item_type: "scope" },
      ],
    },
    human_review: { high: 3, medium: 1, low: 0 },
    learned: [],
    latency: { geminiCalls: 2, attempts: 2, aiMs: 31369, totalMs: 34500 },
  },
  {
    id: "critical-a-global-vs-item",
    label: "CRÍTICO A · total global 6785 vs precio de partida 600",
    tags: ["critical", "global-vs-item"],
    golden: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    ai: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7100, totalMs: 10200 },
  },
  {
    id: "critical-b-unreadable-canonical",
    label: "CRÍTICO B · total canónico ilegible, alternativo legible 6785",
    tags: ["critical", "readable-ranking"],
    golden: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    ai: {
      title: "Kitchen Remodel TEST",
      charge_amount: 6785,
      currency_code: "USD",
      items: [{ goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6900, totalMs: 9900 },
  },
  {
    id: "critical-c-conflict",
    label: "CRÍTICO C · 6785 vs 6485 → conflicto, nunca corregir en silencio",
    tags: ["critical", "conflict"],
    golden: {
      title: "Kitchen Remodel TEST",
      charge_amount: null,
      currency_code: "USD",
      items: [{ key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    ai: {
      title: "Kitchen Remodel TEST",
      charge_amount: null,
      currency_code: "USD",
      conflict_detected: true,
      items: [{ goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 600, planned_cost: null, item_type: "scope" }],
    },
    expect_conflict: true,
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7400, totalMs: 10500 },
  },
  {
    id: "critical-d-unknown-money",
    label: "CRÍTICO D · dinero ilegible permanece nulo, nunca 0",
    tags: ["critical", "unknown-money"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" },
        { key: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: null, item_type: "scope" },
      ],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: null, item_type: "scope" },
        { goldenKey: "b", description: "Install vanity", quantity: 1, unit: null, client_price: UNREADABLE, planned_cost: null, item_type: "scope" },
      ],
    },
    human_review: { high: 2, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 5554, totalMs: 8600 },
  },
  {
    id: "critical-e-hallucinated-item",
    label: "CRÍTICO E · partida inventada cuenta como alucinación",
    tags: ["critical", "hallucination"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [{ key: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" }],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" },
        { goldenKey: null, description: "Permit fee", quantity: 1, unit: null, client_price: 250, planned_cost: null, item_type: "material" },
      ],
    },
    human_review: { high: 0, medium: 1, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 5975, totalMs: 8900 },
  },
  {
    id: "critical-f-missing-item",
    label: "CRÍTICO F · partida real no extraída cuenta como faltante",
    tags: ["critical", "missing-item"],
    golden: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" },
        { key: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 400, item_type: "scope" },
      ],
    },
    ai: {
      title: "Bathroom scope TEST",
      charge_amount: 1950,
      currency_code: "USD",
      items: [{ goldenKey: "a", description: "Demo tile", quantity: 120, unit: "sqft", client_price: 1200, planned_cost: 400, item_type: "scope" }],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 5645, totalMs: 8700 },
  },
  {
    id: "critical-g-learned-separate",
    label: "CRÍTICO G · la corrección aprendida no mejora la precisión de la IA",
    tags: ["critical", "learned-corrections"],
    golden: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [{ key: "a", description: "Pintura interior premium", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" }],
    },
    ai: {
      title: "Interior works TEST",
      charge_amount: 4500,
      currency_code: "USD",
      items: [{ goldenKey: "a", description: "Pintura interior", quantity: 1, unit: null, client_price: 900, planned_cost: null, item_type: "scope" }],
    },
    human_review: { ...noReview, low: 1 },
    learned: [{ aiText: "Pintura interior", suggestion: "Pintura interior premium", outcome: "available", exactHit: true }],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7300, totalMs: 10400 },
  },
  // ── Categoría: documentos manuscritos con COSTO INTERNO impreso ──────────
  // Objetivo: medir el prompt de planned_cost cuando el documento SÍ muestra el
  // costo. Marcados "synthetic-pending-real-photo": ningún estimate QA/TEST del
  // backend autorizado tiene hoy costo interno impreso (todos los planned_cost
  // existentes fueron capturados a mano por la persona, no leídos de la foto).
  // Al recibir fotos reales manuscritas con columna de costo, estos casos se
  // reemplazan por su estado humano confirmado y se retira el tag sintético.
  {
    id: "cost-real-handwritten-column",
    label: "COSTO · foto manuscrita real con columna COST leída correctamente",
    tags: ["qa-derived", "real-photo", "printed-planned-cost", "handwriting-hard"],
    golden: {
      title: "TEST ESTIMATE - QA HANDWRITTEN",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demo tile", quantity: 120, unit: null, client_price: 1200, planned_cost: 400, item_type: "scope" },
        { key: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 200, item_type: "scope" },
        { key: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: 90, item_type: "scope" },
      ],
    },
    ai: {
      title: "TEST ESTIMATE - QA HANDWRITTEN",
      charge_amount: 1950,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demo tile", quantity: 120, unit: null, client_price: 1200, planned_cost: 400, item_type: "scope" },
        { goldenKey: "b", description: "Install vanity", quantity: 1, unit: null, client_price: 450, planned_cost: 200, item_type: "scope" },
        { goldenKey: "c", description: "Paint walls", quantity: 1, unit: null, client_price: 300, planned_cost: 90, item_type: "scope" },
      ],
    },
    human_review: noReview,
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 7100, totalMs: 10200 },
  },
  {

    id: "cost-a-column-header",
    label: "COSTO · encabezado de columna \"COST\" aplica a todas las filas",
    tags: ["printed-planned-cost", "handwriting-hard", "synthetic-pending-real-photo"],
    golden: {
      title: "Deck rebuild TEST",
      charge_amount: 5200,
      currency_code: "USD",
      items: [
        { key: "a", description: "Demolition", quantity: 1, unit: null, client_price: 900, planned_cost: 450, item_type: "scope" },
        { key: "b", description: "Framing", quantity: 1, unit: null, client_price: 2600, planned_cost: 1400, item_type: "labor" },
        { key: "c", description: "Decking boards", quantity: 320, unit: "sqft", client_price: 1700, planned_cost: 1100, item_type: "material" },
      ],
    },
    ai: {
      title: "Deck rebuild TEST",
      charge_amount: 5200,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Demolition", quantity: 1, unit: null, client_price: 900, planned_cost: 450, item_type: "scope" },
        { goldenKey: "b", description: "Framing", quantity: 1, unit: null, client_price: 2600, planned_cost: null, item_type: "labor" },
        { goldenKey: "c", description: "Decking boards", quantity: 320, unit: "sqft", client_price: 1700, planned_cost: null, item_type: "material" },
      ],
    },
    human_review: { high: 2, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6600, totalMs: 9700 },
  },
  {
    id: "cost-b-mat-lab-abbrev",
    label: "COSTO · abreviaturas manuscritas mat/lab como costo interno",
    tags: ["printed-planned-cost", "abbreviations", "synthetic-pending-real-photo"],
    golden: {
      title: "Fence install TEST",
      charge_amount: 3100,
      currency_code: "USD",
      items: [
        { key: "a", description: "Posts and concrete", quantity: 12, unit: "ea", client_price: 1200, planned_cost: 620, item_type: "material" },
        { key: "b", description: "Panels", quantity: 11, unit: "ea", client_price: 1100, planned_cost: 700, item_type: "material" },
        { key: "c", description: "Install labor", quantity: 1, unit: null, client_price: 800, planned_cost: 500, item_type: "labor" },
      ],
    },
    ai: {
      title: "Fence install TEST",
      charge_amount: 3100,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Posts and concrete", quantity: 12, unit: "ea", client_price: 1200, planned_cost: 620, item_type: "material" },
        { goldenKey: "b", description: "Panels", quantity: 11, unit: "ea", client_price: 1100, planned_cost: 700, item_type: "material" },
        { goldenKey: "c", description: "Install labor", quantity: 1, unit: null, client_price: 800, planned_cost: null, item_type: "labor" },
      ],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6300, totalMs: 9400 },
  },
  {
    id: "cost-c-illegible-cost",
    label: "COSTO · costo impreso pero ilegible permanece nulo, nunca 0",
    tags: ["printed-planned-cost", "unknown-money", "synthetic-pending-real-photo"],
    golden: {
      title: "Roof patch TEST",
      charge_amount: 1450,
      currency_code: "USD",
      items: [
        { key: "a", description: "Shingle patch", quantity: 1, unit: null, client_price: 950, planned_cost: 500, item_type: "material" },
        { key: "b", description: "Sealant", quantity: 1, unit: null, client_price: 500, planned_cost: 180, item_type: "material" },
      ],
    },
    ai: {
      title: "Roof patch TEST",
      charge_amount: 1450,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Shingle patch", quantity: 1, unit: null, client_price: 950, planned_cost: UNREADABLE, item_type: "material" },
        { goldenKey: "b", description: "Sealant", quantity: 1, unit: null, client_price: 500, planned_cost: 180, item_type: "material" },
      ],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 5900, totalMs: 9000 },
  },
  {
    id: "cost-d-no-client-price-copy",
    label: "COSTO · copiar el precio del cliente como costo interno es error",
    tags: ["printed-planned-cost", "monetary-guard", "synthetic-pending-real-photo"],
    golden: {
      title: "Drywall repair TEST",
      charge_amount: 2200,
      currency_code: "USD",
      items: [
        { key: "a", description: "Drywall repair", quantity: 1, unit: null, client_price: 1400, planned_cost: 600, item_type: "scope" },
        { key: "b", description: "Texture and paint", quantity: 1, unit: null, client_price: 800, planned_cost: 300, item_type: "scope" },
      ],
    },
    ai: {
      title: "Drywall repair TEST",
      charge_amount: 2200,
      currency_code: "USD",
      items: [
        { goldenKey: "a", description: "Drywall repair", quantity: 1, unit: null, client_price: 1400, planned_cost: 1400, item_type: "scope" },
        { goldenKey: "b", description: "Texture and paint", quantity: 1, unit: null, client_price: 800, planned_cost: 300, item_type: "scope" },
      ],
    },
    human_review: { high: 1, medium: 0, low: 0 },
    learned: [],
    latency: { geminiCalls: 1, attempts: 1, aiMs: 6050, totalMs: 9150 },
  },
];
