import { PAYMENT_METHODS } from "@/lib/enums";

export type CollectionStatus = "unpaid" | "partial" | "paid";

/** Derives the collection status of a job from what was charged vs collected. */
export const deriveCollectionStatus = (estimateTotal: number, collected: number): CollectionStatus => {
  if (collected <= 0) return "unpaid";
  if (estimateTotal > 0 && collected + 0.01 < estimateTotal) return "partial";
  return "paid";
};

export const collectionStatusLabel = (s: CollectionStatus) =>
  ({ unpaid: "Pendiente", partial: "Parcial", paid: "Pagado" }[s]);

export const collectionStatusClass = (s: CollectionStatus) =>
  ({
    unpaid: "bg-warning text-warning-foreground",
    partial: "bg-muted text-muted-foreground",
    paid: "bg-success text-success-foreground",
  }[s]);

/** Spanish label for a payment method enum value. */
export const paymentMethodLabel = (method?: string | null) =>
  PAYMENT_METHODS.find((m) => m.value === method)?.label ?? (method ?? "—");

export type PaymentIssueKind = "no_client" | "no_project" | "future_date";

/** Review issues for a collected payment. Presentation-only: no financial math. */
export const getPaymentIssueKinds = (
  payment: any,
  today = new Date().toISOString().slice(0, 10),
): PaymentIssueKind[] => {
  const issues: PaymentIssueKind[] = [];

  const hasClient = !!(payment?.clients?.name ?? "").trim() || !!payment?.client_id;
  const hasProject = !!(payment?.projects?.name ?? "").trim() || !!payment?.project_id;
  if (!hasClient) issues.push("no_client");
  if (!hasProject) issues.push("no_project");

  if (payment?.received_on && payment.received_on > today) issues.push("future_date");

  return issues;
};

export const formatPaymentIssueKind = (kind: PaymentIssueKind) =>
  ({ no_client: "Sin cliente", no_project: "Sin proyecto", future_date: "Fecha futura" }[kind]);
