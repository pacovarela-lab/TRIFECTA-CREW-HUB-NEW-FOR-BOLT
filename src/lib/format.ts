export const usd = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const usdPrecise = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export const profitClass = (n: number) =>
  n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground";

export const statusColor = (status: string) => {
  switch (status) {
    case "completed": return "bg-success text-success-foreground";
    case "overdue": return "bg-destructive text-destructive-foreground";
    case "in_progress": return "bg-warning text-warning-foreground";
    case "blocked": return "bg-destructive text-destructive-foreground";
    case "cancelled": return "bg-muted text-muted-foreground";
    default: return "bg-info text-info-foreground"; // pending / upcoming
  }
};

export const isOverdue = (planned_end: string | null, status: string) => {
  if (!planned_end || status === "completed" || status === "cancelled") return false;
  return new Date(planned_end) < new Date(new Date().toDateString());
};
