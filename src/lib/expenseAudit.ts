import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type ExpenseAuditSource = "manual" | "rule" | "import" | "voice" | "ocr";

export type ExpenseFieldChange = {
  field: string;
  label: string;
  before: any;
  after: any;
};

export type ExpenseAuditEntry = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  metadata: {
    source: ExpenseAuditSource;
    rule_id?: string | null;
    rule_name?: string | null;
    changes: ExpenseFieldChange[];
  };
};

const FIELD_LABELS: Record<string, string> = {
  project_id: "Proyecto",
  division_id: "División",
  category_id: "Categoría",
  vendor_id: "Vendor",
  worker_id: "Worker",
  spent_on: "Fecha",
  amount: "Monto",
  description: "Descripción",
  is_overhead: "Overhead",
};

export function diffExpense(
  before: Record<string, any>,
  after: Record<string, any>,
  displayResolvers?: Record<string, (id: any) => string | undefined>,
): ExpenseFieldChange[] {
  const changes: ExpenseFieldChange[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    const b = before?.[key] ?? null;
    const a = after?.[key] ?? null;
    if ((b ?? null) === (a ?? null)) continue;
    const resolve = displayResolvers?.[key];
    changes.push({
      field: key,
      label: FIELD_LABELS[key],
      before: resolve ? resolve(b) ?? b : b,
      after: resolve ? resolve(a) ?? a : a,
    });
  }
  return changes;
}

export async function logExpenseAudit(input: {
  expenseId: string;
  companyId: string;
  source: ExpenseAuditSource;
  changes: ExpenseFieldChange[];
  ruleId?: string | null;
  ruleName?: string | null;
}) {
  if (!input.changes.length) return;
  const { data: user } = await supabase.auth.getUser();
  const payload = {
    company_id: input.companyId,
    user_id: user?.user?.id ?? null,
    action: input.source === "rule" ? "rule_applied" : "expense_corrected",
    entity_type: "expense",
    entity_id: input.expenseId,
    metadata: {
      source: input.source,
      rule_id: input.ruleId ?? null,
      rule_name: input.ruleName ?? null,
      changes: input.changes,
    } as any,
  };
  const { error } = await (supabase.from("audit_logs") as any).insert(payload);
  if (error) console.warn("logExpenseAudit failed", error);
}

export function useExpenseAudit(expenseId?: string | null) {
  return useQuery({
    queryKey: ["expense-audit", expenseId],
    enabled: !!expenseId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("audit_logs") as any)
        .select("id, created_at, user_id, action, metadata")
        .eq("entity_type", "expense")
        .eq("entity_id", expenseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseAuditEntry[];
    },
  });
}
