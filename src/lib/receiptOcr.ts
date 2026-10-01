export type ReceiptOcrResult = {
  vendor: string | null;
  amount: number | null;
  subtotal: number | null;
  tax: number | null;
  spent_on: string | null;
  category: string | null;
  description: string | null;
  payment_method: "cash" | "card" | "transfer" | "check" | "other" | null;
  last4: string | null;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    total: number | null;
  }>;
  confidence: number;
};

const optionalText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
};

const positiveNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const nonNegativeNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const validIsoDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
};

const paymentMethods = new Set(["cash", "card", "transfer", "check", "other"]);

export const parseReceiptOcrResponse = (value: unknown): ReceiptOcrResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La lectura del recibo devolvió una respuesta inválida.");
  }

  const raw = value as Record<string, unknown>;
  if (typeof raw.error === "string" && raw.error.trim()) {
    throw new Error(raw.error.trim());
  }

  const method = typeof raw.payment_method === "string" ? raw.payment_method.toLowerCase() : "";
  const lineItems = Array.isArray(raw.line_items)
    ? raw.line_items.slice(0, 50).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const description = optionalText(row.description, 200);
        if (!description) return [];
        return [{
          description,
          quantity: positiveNumber(row.quantity),
          unit_price: positiveNumber(row.unit_price),
          total: positiveNumber(row.total),
        }];
      })
    : [];

  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;

  return {
    vendor: optionalText(raw.vendor, 120),
    amount: positiveNumber(raw.amount),
    subtotal: positiveNumber(raw.subtotal),
    tax: nonNegativeNumber(raw.tax),
    spent_on: validIsoDate(raw.spent_on),
    category: optionalText(raw.category, 80),
    description: optionalText(raw.description, 500),
    payment_method: paymentMethods.has(method) ? method as ReceiptOcrResult["payment_method"] : null,
    last4: typeof raw.last4 === "string" ? raw.last4.replace(/\D/g, "").slice(-4) || null : null,
    line_items: lineItems,
    confidence,
  };
};

export const withReceiptOcrTimeout = async <T>(request: Promise<T>, timeoutMs = 45_000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("La lectura tardó demasiado. Puedes volver a intentarlo.")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};
