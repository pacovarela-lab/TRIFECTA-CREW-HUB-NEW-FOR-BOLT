import { RECEIPT_STATUSES, type ReceiptStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

const toneToPill: Record<string, string> = {
  default: "pill-muted",
  warning: "pill-pending",
  info: "pill-info",
  success: "pill-success",
  destructive: "pill-danger",
};

export const receiptStatusEdge: Record<ReceiptStatus, string> = {
  uploaded: "edge-muted",
  needs_review: "edge-pending",
  linked_to_project: "edge-info",
  ready_to_convert: "edge-info",
  converted_to_expense: "edge-success",
  rejected: "edge-muted",
};

export function ReceiptStatusBadge({ status, className }: { status: ReceiptStatus; className?: string }) {
  const meta = RECEIPT_STATUSES.find((s) => s.value === status);
  if (!meta) return null;
  return <span className={cn("pill", toneToPill[meta.tone], className)}>{meta.label}</span>;
}
