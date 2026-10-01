import { supabase } from "@/integrations/supabase/client";
import { logExpenseAudit, ExpenseFieldChange } from "@/lib/expenseAudit";

export type ExpenseRuleField = "description" | "vendor" | "category" | "raw" | "spent_on";

export type ExpenseRuleDraft = {
  companyId: string;
  source: {
    description?: string | null;
    vendorName?: string | null;
    categoryName?: string | null;
    projectName?: string | null;
    spentOn?: string | null;
  };
  changes: {
    project_id?: string | null;
    division_id?: string | null;
    category_id?: string | null;
    vendor_id?: string | null;
    worker_id?: string | null;
    date_transform?: "future_date_swap_dm";
  };
  labels: string[];
  defaultField?: ExpenseRuleField;
  defaultPattern?: string;
};

export function suggestFutureDateFix(iso?: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  const today = new Date().toISOString().slice(0, 10);

  if (m <= 12 && d <= 12 && m !== d) {
    const swapped = `${y}-${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
    if (swapped <= today) return swapped;
  }

  const clamped = `${today.slice(0, 4)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return clamped <= today ? clamped : null;
}

function normalize(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function compactText(v: unknown) {
  return normalize(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function haystackForExpense(expense: any, field: string) {
  switch (field) {
    case "vendor":
      return normalize(expense.vendors?.name);
    case "category":
      return normalize(expense.categories?.name);
    case "spent_on":
      return normalize(expense.spent_on);
    case "raw":
      return normalize([
        expense.description,
        expense.vendors?.name,
        expense.categories?.name,
        expense.projects?.name,
        expense.spent_on,
        expense.amount,
      ].filter(Boolean).join(" "));
    case "description":
    default:
      return normalize(expense.description);
  }
}

function matchesRule(rule: any, expense: any) {
  const haystack = haystackForExpense(expense, rule.match_field);
  const pattern = normalize(rule.match_pattern);
  if (!pattern) return false;
  if (rule.match_kind === "exact") return haystack === pattern;
  if (rule.match_kind === "regex") {
    try { return new RegExp(rule.match_pattern, "i").test(haystack); } catch { return false; }
  }
  return haystack.includes(pattern);
}

export async function saveExpenseRule(draft: ExpenseRuleDraft, opts: {
  match_field: ExpenseRuleField;
  match_pattern: string;
  match_kind?: "contains" | "exact" | "regex" | "date_transform";
  auto_confirm?: boolean;
}) {
  const isDateRule = draft.changes.date_transform === "future_date_swap_dm";
  const payload: any = {
    company_id: draft.companyId,
    name: isDateRule
      ? "Aprendida: corregir fechas futuras día/mes"
      : `Aprendida: ${opts.match_pattern.trim().slice(0, 40)}`,
    match_field: isDateRule ? "spent_on" : opts.match_field,
    match_pattern: isDateRule ? "future_date_swap_dm" : opts.match_pattern.trim(),
    match_kind: isDateRule ? "date_transform" : (opts.match_kind ?? "contains"),
    set_project_id: draft.changes.project_id ?? null,
    set_category_id: draft.changes.category_id ?? null,
    set_vendor_id: draft.changes.vendor_id ?? null,
    set_worker_id: draft.changes.worker_id ?? null,
    set_type: "expense",
    auto_confirm: opts.auto_confirm ?? true,
    enabled: true,
    priority: 100,
  };
  const { data, error } = await (supabase.from("import_rules") as any).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

// overwrite=false (the automatic pass when opening Expenses) only fills EMPTY
// fields, so it can never revert a value the user set by hand. overwrite=true is
// used when the user explicitly applies a rule and wants matching expenses fixed.
export async function applyExpenseRulesNow(onlyRules?: any[], opts?: { overwrite?: boolean }) {
  const overwrite = opts?.overwrite ?? false;
  const rules = onlyRules ?? (await (supabase.from("import_rules") as any)
    .select("*")
    .eq("enabled", true)
    .eq("auto_confirm", true)
    .or("set_type.is.null,set_type.eq.expense")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })).data ?? [];

  if (!rules.length) return 0;

  const [{ data: expenses }, { data: projects }, { data: vendors }, { data: categories }, { data: vendorPatterns }] = await Promise.all([
    (supabase.from("expenses") as any).select("*, vendors(name), categories(name), projects(name)"),
    supabase.from("projects").select("id, division_id"),
    supabase.from("vendors").select("id, name"),
    supabase.from("categories").select("id, name"),
    (supabase.from("vendor_category_patterns") as any)
      .select("vendor_id, category_id, project_id, division_id, times_used")
      .order("times_used", { ascending: false }),
  ]);

  const projectDivision = new Map((projects ?? []).map((p: any) => [p.id, p.division_id]));
  let updated = 0;

  const vendorNameById = new Map<string, string>((vendors ?? []).map((v: any) => [v.id, v.name]));
  const categoryNameById = new Map<string, string>((categories ?? []).map((c: any) => [c.id, c.name]));
  const projectNameById = new Map<string, string>();
  for (const e of expenses ?? []) {
    if (e.vendor_id && e.vendors?.name) vendorNameById.set(e.vendor_id, e.vendors.name);
    if (e.category_id && e.categories?.name) categoryNameById.set(e.category_id, e.categories.name);
    if (e.project_id && e.projects?.name) projectNameById.set(e.project_id, e.projects.name);
  }

  const topPatternByVendor = new Map<string, any>();
  for (const p of vendorPatterns ?? []) {
    if (!topPatternByVendor.has(p.vendor_id)) topPatternByVendor.set(p.vendor_id, p);
  }

  const vendorUsage = new Map<string, number>();
  for (const e of expenses ?? []) {
    if (e.vendor_id) vendorUsage.set(e.vendor_id, (vendorUsage.get(e.vendor_id) ?? 0) + 1);
  }

  const vendorCandidates = (vendors ?? [])
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      normalized: compactText(v.name),
      patternUses: Number(topPatternByVendor.get(v.id)?.times_used ?? 0),
      usage: vendorUsage.get(v.id) ?? 0,
    }))
    .filter((v: any) => v.normalized.length >= 4)
    .sort((a: any, b: any) =>
      (b.patternUses - a.patternUses) ||
      (b.usage - a.usage) ||
      (b.normalized.length - a.normalized.length)
    );

  const inferVendorId = (expense: any) => {
    const text = compactText([expense.description, expense.vendors?.name].filter(Boolean).join(" "));
    if (!text) return null;
    const padded = ` ${text} `;
    const match = vendorCandidates.find((v: any) => padded.includes(` ${v.normalized} `));
    return match?.id ?? null;
  };

  for (const expense of expenses ?? []) {
    const patch: Record<string, any> = {};
    let matchedRule: any = null;
    let learnedPatternName: string | null = null;

    for (const rule of rules) {
      if (rule.match_kind === "date_transform" && rule.match_pattern === "future_date_swap_dm") {
        const fixed = expense.spent_on > new Date().toISOString().slice(0, 10)
          ? suggestFutureDateFix(expense.spent_on)
          : null;
        if (fixed && fixed !== expense.spent_on) {
          patch.spent_on = fixed;
          matchedRule = rule;
        }
        continue;
      }

      if (!matchesRule(rule, expense)) continue;
      // In fill-only mode, never touch a field the expense already has a value for.
      const canSet = (field: string) => overwrite || !expense[field];
      if (rule.set_project_id && rule.set_project_id !== expense.project_id && canSet("project_id")) {
        patch.project_id = rule.set_project_id;
        const div = projectDivision.get(rule.set_project_id);
        if (div) patch.division_id = div;
      }
      if (rule.set_category_id && rule.set_category_id !== expense.category_id && canSet("category_id")) patch.category_id = rule.set_category_id;
      if (rule.set_vendor_id && rule.set_vendor_id !== expense.vendor_id && canSet("vendor_id")) patch.vendor_id = rule.set_vendor_id;
      if (rule.set_worker_id && rule.set_worker_id !== expense.worker_id && canSet("worker_id")) patch.worker_id = rule.set_worker_id;
      if (Object.keys(patch).length > 0) matchedRule = rule;
      break;
    }

    const inferredVendorId = expense.vendor_id ?? patch.vendor_id ?? inferVendorId(expense);
    if (!expense.vendor_id && inferredVendorId && !patch.vendor_id) {
      patch.vendor_id = inferredVendorId;
      learnedPatternName = `Vendor detectado: ${vendorNameById.get(inferredVendorId) ?? "vendor"}`;
    }

    const vendorPattern = inferredVendorId ? topPatternByVendor.get(inferredVendorId) : null;
    if (vendorPattern) {
      if (!expense.category_id && !patch.category_id && vendorPattern.category_id) {
        patch.category_id = vendorPattern.category_id;
        learnedPatternName = learnedPatternName ?? `Patrón aprendido de vendor: ${vendorNameById.get(inferredVendorId) ?? "vendor"}`;
      }
      if (!expense.project_id && !patch.project_id && vendorPattern.project_id) {
        patch.project_id = vendorPattern.project_id;
        patch.division_id = vendorPattern.division_id ?? projectDivision.get(vendorPattern.project_id) ?? null;
        learnedPatternName = learnedPatternName ?? `Patrón aprendido de vendor: ${vendorNameById.get(inferredVendorId) ?? "vendor"}`;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await (supabase.from("expenses") as any).update(patch).eq("id", expense.id);
      if (!error) {
        updated++;
        if ((matchedRule || learnedPatternName) && expense.company_id) {
          const labels: Record<string, string> = {
            project_id: "Proyecto", division_id: "División", category_id: "Categoría",
            vendor_id: "Vendor", worker_id: "Worker", spent_on: "Fecha",
          };
          const resolve = (field: string, id: any) => {
            if (id == null) return id;
            if (field === "project_id") return projectNameById.get(id) ?? id;
            if (field === "vendor_id") return vendorNameById.get(id) ?? id;
            if (field === "category_id") return categoryNameById.get(id) ?? id;
            return id;
          };
          const changes: ExpenseFieldChange[] = Object.entries(patch).map(([field, after]) => ({
            field,
            label: labels[field] ?? field,
            before: resolve(field, (expense as any)[field]),
            after: resolve(field, after),
          }));
          await logExpenseAudit({
            expenseId: expense.id,
            companyId: expense.company_id,
            source: "rule",
            ruleId: matchedRule?.id ?? null,
            ruleName: matchedRule?.name ?? learnedPatternName,
            changes,
          });
        }
      }
    }
  }

  return updated;
}

export function defaultRulePatternFromExpense(expense: any) {
  const vendorName = expense?.vendors?.name ?? expense?.vendorName;
  const description = expense?.description;
  const categoryName = expense?.categories?.name ?? expense?.categoryName;
  if (vendorName) return { field: "vendor" as ExpenseRuleField, pattern: vendorName };
  if (description) return { field: "description" as ExpenseRuleField, pattern: description };
  if (categoryName) return { field: "category" as ExpenseRuleField, pattern: categoryName };
  return { field: "raw" as ExpenseRuleField, pattern: "" };
}