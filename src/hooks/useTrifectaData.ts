/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape, prefer-const */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { countReceiptInboxRows } from "@/lib/receiptInbox";
import { isLaborExpense } from "@/lib/labor";
import { computeProjectAlerts } from "@/lib/operationalAlerts";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type WorkerInsert = Database["public"]["Tables"]["workers"]["Insert"];
type WorkerUpdate = Database["public"]["Tables"]["workers"]["Update"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];
type EstimateItemUpdate = Database["public"]["Tables"]["estimate_items"]["Update"];
type EstimateItemInsert = Database["public"]["Tables"]["estimate_items"]["Insert"];

export const useDivisions = () =>
  useQuery({
    queryKey: ["divisions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

export const useWorkers = (opts?: { activeOnly?: boolean }) =>
  useQuery({
    queryKey: ["workers", opts?.activeOnly ? "active" : "all"],
    queryFn: async () => {
      let q = supabase.from("workers").select("*").order("name");
      if (opts?.activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

export const useClients = () =>
  useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

export const useProjects = () =>
  useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, divisions(name), clients(name), business_units(name, is_active)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useProject = (id: string | undefined) =>
  useQuery({
    enabled: !!id,
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, divisions(name), clients(name), business_units(name, is_active)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const useProjectFinancials = (projectId: string | undefined) =>
  useQuery({
    enabled: !!projectId,
    queryKey: ["financials", projectId],
    queryFn: async () => {
      // Use the unified ledger as the single source of truth.
      const { fetchLedger, aggregateProject } = await import("@/lib/financialLedger");
      const { computeOverheadByProject } = await import("@/lib/overhead");
      const [entries, exp, pay, ests, ohExp, allProjects] = await Promise.all([
        fetchLedger(),
        // Labor / materials / other breakdown still requires raw expense rows.
        supabase
          .from("expenses")
          .select("amount, categories(name), worker_id, description, is_overhead")
          .eq("project_id", projectId!),
        // Payments fetch is no longer used for totals (ledger replaces it) but
        // we keep estimateTotal / balanceDue calculations below.
        supabase.from("payments").select("amount").eq("project_id", projectId!),
        supabase.from("estimates").select("id").eq("project_id", projectId!),
        supabase.from("expenses").select("project_id, amount, spent_on, is_overhead"),
        supabase.from("projects").select("id, is_sandbox, exclude_from_overhead"),
      ]);
      if (exp.error) throw exp.error;
      if (pay.error) throw pay.error;
      if (ests.error) throw ests.error;
      if (ohExp.error) throw ohExp.error;
      if (allProjects.error) throw allProjects.error;

      const overheadMap = computeOverheadByProject(
        (ohExp.data ?? []) as any[],
        (allProjects.data ?? []) as any[],
      );
      const fin = aggregateProject(entries, projectId!, overheadMap.get(projectId!) ?? 0);

      // Labor / materials / other breakdown (excludes overhead expenses)
      const rows = ((exp.data ?? []) as any[]).filter((r) => !r.is_overhead);
      let labor = 0, materials = 0, other = 0;
      for (const r of rows) {
        const n = Number(r.amount);
        const catName = (r.categories?.name ?? "").toLowerCase();
        const isLabor = isLaborExpense(r);
        const isMat = !isLabor && (/material/.test(catName) || catName === "");
        if (isLabor) labor += n;
        else if (isMat) materials += n;
        else other += n;
      }

      const estIds = (ests.data ?? []).map((e) => e.id);
      let estimateTotal = 0;
      if (estIds.length) {
        const { data: items } = await supabase
          .from("estimate_items").select("total").in("estimate_id", estIds);
        estimateTotal = (items ?? []).reduce((s, r: any) => s + Number(r.total ?? 0), 0);
      }

      const spent = fin.confirmedExpenses;
      const directSpent = fin.directExpenses + fin.splitExpenses;
      const collected = fin.confirmedRevenue;
      const profit = fin.confirmedProfit;
      const margin = fin.margin;
      const projectedMargin = estimateTotal > 0 ? (estimateTotal - spent) / estimateTotal : 0;
      const balanceDue = Math.max(0, estimateTotal - collected);
      return {
        spent, directSpent, overhead: fin.overhead, collected, profit, margin,
        estimateTotal, labor, materials, other, projectedMargin, balanceDue,
        // New, unified fields — screens can opt-in to display them.
        needsReviewRevenue: fin.needsReviewRevenue,
        needsReviewExpenses: fin.needsReviewExpenses,
        needsReviewCount: fin.needsReviewCount,
      };
    },
  });



export const useTasks = (projectId?: string) =>
  useQuery({
    queryKey: ["tasks", projectId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*, workers(name), projects(name)").order("position");
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

export const useEstimateItems = (projectId: string | undefined) =>
  useQuery({
    enabled: !!projectId,
    queryKey: ["estimate_items", projectId],
    queryFn: async () => {
      const { data: ests, error: e1 } = await supabase
        .from("estimates").select("id").eq("project_id", projectId!);
      if (e1) throw e1;
      const ids = (ests ?? []).map((e) => e.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("estimate_items").select("*").in("estimate_id", ids).order("position");
      if (error) throw error;
      return data;
    },
  });

export const useDashboardSummary = (businessUnitId?: string | null) =>
  useQuery({
    queryKey: ["dashboard-summary", businessUnitId ?? "all"],
    queryFn: async () => {
      const { fetchLedger, aggregateCompany, aggregateProject } = await import(
        "@/lib/financialLedger"
      );
      const { computeOverheadAllocation, scopeOverheadToProjects } = await import("@/lib/overhead");

      const [
        divisions,
        projectsRaw,
        ohExp,
        tasks,
        categories,
        workers,
        businessUnitsRaw,
        entries,
      ] = await Promise.all([
        supabase.from("divisions").select("*").order("name"),
        supabase.from("projects").select(
          "id, name, division_id, business_unit_id, estimated_total, status, end_date, is_sandbox, exclude_from_overhead",
        ),
        supabase.from("expenses").select("project_id, amount, spent_on, is_overhead"),
        supabase.from("tasks").select(
          "id, title, status, planned_start_date, planned_end_date, actual_end_date, division_id, project_id, assigned_worker_id, updated_at",
        ),
        supabase.from("categories").select("id, name"),
        supabase.from("workers").select("id, name, active").eq("active", true),
        supabase.from("business_units").select("id, name"),
        fetchLedger(),
      ]);
      if (divisions.error) throw divisions.error;
      const divs = divisions.data ?? [];
      const today = new Date(new Date().toDateString());

      // Sandbox projects are excluded from financial roll-ups.
      const sandboxIds = new Set(
        (projectsRaw.data ?? []).filter((p: any) => p.is_sandbox).map((p: any) => p.id),
      );
      const projects = {
        data: (projectsRaw.data ?? []).filter((p: any) =>
          !p.is_sandbox && (!businessUnitId || p.business_unit_id === businessUnitId),
        ),
      };

      const scopedProjectIds = new Set(projects.data.map((project) => project.id));
      const scopedEntries = businessUnitId
        ? entries.filter((entry) => entry.project_id && scopedProjectIds.has(entry.project_id))
        : entries;

      const overheadAllocation = computeOverheadAllocation(
        (ohExp.data ?? []) as any[],
        (projectsRaw.data ?? []) as any[],
      );
      // An individual Business Area receives only overhead explicitly tied to
      // one of its projects. Company-wide overhead remains visible in All Areas
      // and is never implicitly prorated into a filtered area.
      const overheadMap = businessUnitId
        ? scopeOverheadToProjects(overheadAllocation.directlyAssignedByProject, scopedProjectIds)
        : overheadAllocation.totalByProject;

      const company = aggregateCompany(scopedEntries, overheadMap, {
        excludeProjectIds: sandboxIds,
      });

      // Per-division roll-ups built from the same ledger.
      const byDiv = divs.map((d) => {
        const dProjects = (projects.data ?? []).filter((p) => p.division_id === d.id);
        const estimated = dProjects.reduce(
          (s, p) => s + Number(p.estimated_total ?? 0),
          0,
        );
        let spent = 0;
        let collected = 0;
        for (const p of dProjects) {
          const f = company.byProject.get(p.id);
          if (!f) continue;
          spent += f.confirmedExpenses;
          collected += f.confirmedRevenue;
        }
        const dTasks = (tasks.data ?? []).filter((t) => t.division_id === d.id);
        const overdue = dTasks.filter(
          (t) =>
            t.status !== "completed" &&
            t.status !== "cancelled" &&
            t.planned_end_date &&
            new Date(t.planned_end_date) < today,
        ).length;
        return {
          ...d,
          projects: dProjects.length,
          estimated,
          spent,
          collected,
          profit: collected - spent,
          overdue,
        };
      });

      const totals = {
        estimated: byDiv.reduce((a, d) => a + d.estimated, 0),
        spent: company.confirmedExpenses,
        collected: company.confirmedRevenue,
        profit: company.confirmedProfit,
        overdue: byDiv.reduce((a, d) => a + d.overdue, 0),
        projects: byDiv.reduce((a, d) => a + d.projects, 0),
        // New: explicit needs-review surface (never silently mixed).
        needsReviewRevenue: company.needsReviewRevenue,
        needsReviewExpenses: company.needsReviewExpenses,
        needsReviewCount: company.needsReviewCount,
      };

      // Expense category roll-up (uses raw expense rows for category lookups;
      // overhead rows are excluded as they are prorated, not categorical).
      const catMap = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
      const byCategory = new Map<string, number>();
      const expensesForCategoryView = (await supabase
        .from("expenses")
        .select("project_id, amount, category_id, is_overhead")
      ).data ?? [];
      for (const e of expensesForCategoryView) {
        if ((e as any).is_overhead) continue;
        if (e.project_id && sandboxIds.has(e.project_id)) continue;
        if (businessUnitId && (!e.project_id || !scopedProjectIds.has(e.project_id))) continue;
        const key = e.category_id ? (catMap.get(e.category_id) ?? "Uncategorized") : "Uncategorized";
        byCategory.set(key, (byCategory.get(key) ?? 0) + Number(e.amount));
      }
      const expenseCategories = Array.from(byCategory.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      const unassignedExpenses = company.unassignedExpenses;
      const unassignedPayments = company.unassignedPayments;

      // Task overview
      const todayStr = new Date().toISOString().slice(0, 10);
      const allTasks = businessUnitId
        ? (tasks.data ?? []).filter((task) => scopedProjectIds.has(task.project_id))
        : (tasks.data ?? []);
      const overdueTasks = allTasks.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled" && t.planned_end_date && t.planned_end_date < todayStr,
      );
      const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
      const completedToday = allTasks.filter(
        (t) => t.status === "completed" && (t.actual_end_date === todayStr || (t.updated_at ?? "").slice(0, 10) === todayStr),
      );

      const activeWorkers = workers.data ?? [];
      const workerLoad = activeWorkers
        .map((w) => {
          const active = allTasks.filter(
            (t) => t.assigned_worker_id === w.id && t.status !== "completed" && t.status !== "cancelled",
          ).length;
          return { id: w.id, name: w.name, activeTasks: active, overloaded: active >= 5 };
        })
        .sort((a, b) => b.activeTasks - a.activeTasks);

      // Per-project rollup pulled from the unified summary (includes splits + overhead).
      const projectRollup = (projects.data ?? []).map((p) => {
        const pTasks = allTasks.filter((t) => t.project_id === p.id);
        const overdueCount = pTasks.filter(
          (t) => t.status !== "completed" && t.status !== "cancelled" && t.planned_end_date && t.planned_end_date < todayStr,
        ).length;
        const completedCount = pTasks.filter((t) => t.status === "completed").length;
        const fin = company.byProject.get(p.id) ??
          aggregateProject(scopedEntries, p.id, overheadMap.get(p.id) ?? 0);
        const division = (divs.find((d) => d.id === p.division_id) as any)?.name ?? null;
        const businessUnit = ((businessUnitsRaw.data ?? []) as any[]).find((bu) => bu.id === p.business_unit_id)?.name ?? null;
        return {
          id: p.id, name: p.name, division_id: p.division_id, division, business_unit: businessUnit, end_date: p.end_date,
          status: p.status,
          spent: fin.confirmedExpenses,
          collected: fin.confirmedRevenue,
          profit: fin.confirmedProfit,
          totalTasks: pTasks.length, completedTasks: completedCount, overdueTasks: overdueCount,
          estimated: Number(p.estimated_total ?? 0),
          needsReviewCount: fin.needsReviewCount,
        };
      });

      const negativeProjects = projectRollup
        .filter((p) => p.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 5);

      const atRiskProjects = projectRollup
        .filter((p) => p.status !== "completed" && (p.profit < 0 || p.overdueTasks > 0))
        .sort((a, b) => (b.overdueTasks - a.overdueTasks) || (a.profit - b.profit))
        .slice(0, 8);

      const activeProjectsCount = projectRollup.filter((p) => p.status === "active").length;

      return {
        divisions: byDiv,
        totals: { ...totals, activeProjects: activeProjectsCount },
        negativeProjects,
        atRiskProjects,
        projectRollup,
        expenseCategories,
        unassignedExpenses,
        unassignedPayments,
        taskOverview: {
          overdue: overdueTasks.length,
          inProgress: inProgressTasks.length,
          completedToday: completedToday.length,
        },
        workerLoad,
      };
    },
  });


// ============ ALERTS ============

export const useAlerts = (opts?: { onlyOpen?: boolean }) =>
  useQuery({
    queryKey: ["alerts", opts?.onlyOpen ? "open" : "all"],
    queryFn: async () => {
      let q = supabase
        .from("alerts")
        .select("*, projects(name), divisions(name)")
        .order("created_at", { ascending: false });
      if (opts?.onlyOpen) q = q.eq("acknowledged", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const useResolveAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alerts").update({ acknowledged: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alerta resuelta");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo resolver"),
  });
};

export const useRewardNotifications = (opts?: { unseenOnly?: boolean; limit?: number }) =>
  useQuery({
    queryKey: ["reward-notifications", opts?.unseenOnly ? "unseen" : "all", opts?.limit ?? 10],
    queryFn: async () => {
      let q = supabase
        .from("reward_notifications")
        .select("*, projects(name)")
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 10);
      if (opts?.unseenOnly) q = q.eq("seen", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

// Generate alerts/rewards from current operational state.
// Idempotent-ish: skips creating an alert if an unresolved alert with the same kind+task/project already exists.
export const useSyncOperationalAlerts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { companyId } = await getCompanyId();
      const todayStr = new Date().toISOString().slice(0, 10);

      const [tasksRes, projectsRes, expensesRes, paymentsRes, estimatesRes, openAlertsRes, workersRes] = await Promise.all([
        supabase.from("tasks").select("id, title, status, planned_start_date, planned_end_date, actual_end_date, project_id, division_id, company_id, assigned_worker_id, updated_at"),
        supabase.from("projects").select("id, name, division_id, end_date, status, estimated_total"),
        supabase.from("expenses").select("project_id, division_id, amount, worker_id, category_id, is_overhead, spent_on, created_at, categories(name)"),
        supabase.from("payments").select("project_id, amount, created_at"),
        supabase.from("estimates").select("id, project_id"),
        supabase.from("alerts").select("kind, task_id, project_id").eq("acknowledged", false),
        supabase.from("workers").select("id, active").eq("active", true),
      ]);

      // Fetch estimate items with category to compute estimated labor per project
      const allEstIdsForItems = (estimatesRes.data ?? []).map((e) => e.id);
      let estLaborByProject = new Map<string, number>();
      if (allEstIdsForItems.length) {
        const { data: estItems } = await supabase
          .from("estimate_items").select("estimate_id, total, category").in("estimate_id", allEstIdsForItems);
        const estIdToProject = new Map<string, string>();
        for (const e of estimatesRes.data ?? []) {
          if (e.project_id) estIdToProject.set(e.id, e.project_id);
        }
        for (const it of estItems ?? []) {
          const cat = (it.category ?? "").toLowerCase();
          if (/labor|mano de obra/.test(cat)) {
            const pid = estIdToProject.get(it.estimate_id);
            if (pid) estLaborByProject.set(pid, (estLaborByProject.get(pid) ?? 0) + Number(it.total ?? 0));
          }
        }
      }
      const tasks = tasksRes.data ?? [];
      const projects = projectsRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const estimates = estimatesRes.data ?? [];
      const openAlerts = openAlertsRes.data ?? [];
      const workers = workersRes.data ?? [];

      const has = (kind: string, task_id?: string | null, project_id?: string | null) =>
        openAlerts.some((a) => a.kind === kind && (a.task_id ?? null) === (task_id ?? null) && (a.project_id ?? null) === (project_id ?? null));

      type AlertRow = Database["public"]["Tables"]["alerts"]["Insert"];
      type RewardRow = Database["public"]["Tables"]["reward_notifications"]["Insert"];
      const alertsToInsert: AlertRow[] = [];
      const rewardsToInsert: RewardRow[] = [];

      // 1. Task overdue
      for (const t of tasks) {
        if (t.status !== "completed" && t.status !== "cancelled" && t.planned_end_date && t.planned_end_date < todayStr) {
          if (!has("task_overdue", t.id, t.project_id)) {
            alertsToInsert.push({
              company_id: companyId, project_id: t.project_id, division_id: t.division_id, task_id: t.id,
              kind: "task_overdue", severity: "warning",
              message: `Task "${t.title}" is overdue.`,
            });
          }
        }
        // 2. Task not started after planned_start_date
        if (t.status === "pending" && t.planned_start_date && t.planned_start_date < todayStr) {
          if (!has("task_not_started", t.id, t.project_id)) {
            alertsToInsert.push({
              company_id: companyId, project_id: t.project_id, division_id: t.division_id, task_id: t.id,
              kind: "task_not_started", severity: "info",
              message: `Task "${t.title}" hasn't started yet.`,
            });
          }
        }
      }

      // Estimate totals per project
      const estIdsByProject = new Map<string, string[]>();
      for (const e of estimates) {
        if (!e.project_id) continue;
        const arr = estIdsByProject.get(e.project_id) ?? [];
        arr.push(e.id);
        estIdsByProject.set(e.project_id, arr);
      }
      const allEstIds = estimates.map((e) => e.id);
      let itemsByEst = new Map<string, number>();
      if (allEstIds.length) {
        const { data: items } = await supabase.from("estimate_items").select("estimate_id, total").in("estimate_id", allEstIds);
        for (const it of items ?? []) {
          itemsByEst.set(it.estimate_id, (itemsByEst.get(it.estimate_id) ?? 0) + Number(it.total ?? 0));
        }
      }

      for (const p of projects) {
        if (p.status === "completed" || p.status === "cancelled") continue;

        const pTasks = tasks.filter((t) => t.project_id === p.id);
        const overdue = pTasks.some((t) => t.status !== "completed" && t.status !== "cancelled" && t.planned_end_date && t.planned_end_date < todayStr);
        const projectLate = p.end_date && p.end_date < todayStr;
        const pSpent = expenses.filter((e) => e.project_id === p.id).reduce((s, e) => s + Number(e.amount), 0);
        const pCollected = payments.filter((pay) => pay.project_id === p.id).reduce((s, pay) => s + Number(pay.amount), 0);
        const profit = pCollected - pSpent;

        // 3. Project behind schedule
        if ((overdue || projectLate) && !has("project_behind", null, p.id)) {
          alertsToInsert.push({
            company_id: companyId, project_id: p.id, division_id: p.division_id,
            kind: "project_behind", severity: projectLate ? "critical" : "warning",
            message: `Project "${p.name}" is behind schedule.`,
          });
        }
        // 4. Negative profit
        if (profit < 0 && !has("project_negative_profit", null, p.id)) {
          alertsToInsert.push({
            company_id: companyId, project_id: p.id, division_id: p.division_id,
            kind: "project_negative_profit", severity: "critical",
            message: `Project "${p.name}" has negative profit.`,
          });
        }
        // 5. Expenses exceed estimate
        const estTotal = (estIdsByProject.get(p.id) ?? []).reduce((s, eid) => s + (itemsByEst.get(eid) ?? 0), 0);
        if (estTotal > 0 && pSpent > estTotal && !has("expenses_exceed_estimate", null, p.id)) {
          alertsToInsert.push({
            company_id: companyId, project_id: p.id, division_id: p.division_id,
            kind: "expenses_exceed_estimate", severity: "critical",
            message: `Project "${p.name}" expenses exceed estimate.`,
          });
        }

        // 7-9. Labor over budget, temporary deficit, project inactivity (new delta alerts)
        const pExpenses = expenses.filter((e) => e.project_id === p.id);
        const pLaborReal = pExpenses
          .filter((e) => !e.is_overhead && isLaborExpense(e as any))
          .reduce((s, e) => s + Number(e.amount), 0);
        const pLaborEstimated = estLaborByProject.get(p.id) ?? 0;

        // Last activity = max of: expense spent_on, payment created_at, task updated_at
        const pPayments = payments.filter((pay) => pay.project_id === p.id);
        const pTaskDates = pTasks.map((t) => t.updated_at).filter(Boolean) as string[];
        const expenseDates = pExpenses.map((e) => e.spent_on).filter(Boolean) as string[];
        const paymentDates = pPayments.map((pay) => pay.created_at).filter(Boolean) as string[];
        const allDates = [...expenseDates, ...paymentDates, ...pTaskDates];
        const lastActivity = allDates.length ? allDates.sort().reverse()[0] : null;

        const newAlerts = computeProjectAlerts({
          project_id: p.id,
          project_name: p.name,
          division_id: p.division_id,
          labor_real: pLaborReal,
          labor_estimated: pLaborEstimated,
          total_costs: pSpent,
          total_collected: pCollected,
          last_activity_date: lastActivity,
        }, todayStr);

        for (const na of newAlerts) {
          if (!has(na.kind, null, p.id)) {
            alertsToInsert.push({
              company_id: companyId, project_id: p.id, division_id: p.division_id,
              kind: na.kind, severity: na.severity,
              message: na.message,
            });
          }
        }

        // Reward: project ahead of plan or strong profit (no duplicate within last 7d for same project+kind)
        const totalTasks = pTasks.length;
        const completed = pTasks.filter((t) => t.status === "completed").length;
        if (totalTasks > 0 && completed === totalTasks && p.end_date && todayStr <= p.end_date) {
          rewardsToInsert.push({
            company_id: companyId, project_id: p.id,
            message: `Nice work — "${p.name}" finished on/ahead of plan.`,
          });
        }
        if (pCollected > 0 && profit / pCollected >= 0.25) {
          rewardsToInsert.push({
            company_id: companyId, project_id: p.id,
            message: `Excellent — strong profit on "${p.name}".`,
          });
        }
      }

      // 6. Worker overloaded
      for (const w of workers) {
        const activeCount = tasks.filter((t) => t.assigned_worker_id === w.id && t.status !== "completed" && t.status !== "cancelled").length;
        if (activeCount >= 8 && !has("worker_overloaded", null, null)) {
          // Track per-worker via message text — we don't have worker_id column on alerts
          alertsToInsert.push({
            company_id: companyId,
            kind: "worker_overloaded", severity: "warning",
            message: `Worker has ${activeCount} active tasks — review workload.`,
          });
        }
      }

      // De-duplicate rewards against last 7 days
      if (rewardsToInsert.length) {
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: recent } = await supabase
          .from("reward_notifications")
          .select("project_id, message")
          .gte("created_at", since);
        const seen = new Set((recent ?? []).map((r) => `${r.project_id}::${r.message}`));
        const unique = rewardsToInsert.filter((r) => !seen.has(`${r.project_id}::${r.message}`));
        if (unique.length) await supabase.from("reward_notifications").insert(unique);
      }

      if (alertsToInsert.length) {
        await supabase.from("alerts").insert(alertsToInsert);
      }
      return { alerts: alertsToInsert.length, rewards: rewardsToInsert.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["reward-notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

// ============ MUTATIONS ============

const invalidateProjectScopes = (qc: ReturnType<typeof useQueryClient>, projectId?: string) => {
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  if (projectId) {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["financials", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["estimate_items", projectId] });
  }
  qc.invalidateQueries({ queryKey: ["tasks", "all"] });
};

export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ProjectUpdate }) => {
      const { error } = await supabase.from("projects").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidateProjectScopes(qc, v.id); toast.success("Trabajo guardado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar el trabajo"),
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Clean dependent rows that have no FK cascade defined
      await supabase.from("tasks").delete().eq("project_id", id);
      const { data: ests } = await supabase.from("estimates").select("id").eq("project_id", id);
      const estIds = (ests ?? []).map((e) => e.id);
      if (estIds.length) {
        await supabase.from("estimate_items").delete().in("estimate_id", estIds);
        await supabase.from("estimates").delete().in("id", estIds);
      }
      await supabase.from("expenses").delete().eq("project_id", id);
      await supabase.from("payments").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateProjectScopes(qc); toast.success("Trabajo eliminado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

export const useProjectDependencyCounts = (projectId: string | undefined) =>
  useQuery({
    enabled: !!projectId,
    queryKey: ["project-deps", projectId],
    queryFn: async () => {
      const [t, e, p] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId!),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("project_id", projectId!),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("project_id", projectId!),
      ]);
      return { tasks: t.count ?? 0, expenses: e.count ?? 0, payments: p.count ?? 0 };
    },
  });

export const useUpdateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, projectId }: { id: string; patch: TaskUpdate; projectId?: string }) => {
      const { data: prev } = await supabase.from("tasks").select("*").eq("id", id).single();
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;

      // Record assignment pattern when worker changes to a real worker
      const newWorker = patch.assigned_worker_id as string | null | undefined;
      if (prev && newWorker && newWorker !== prev.assigned_worker_id) {
        await recordAssignmentPattern({
          worker_id: newWorker,
          company_id: prev.company_id,
          division_id: prev.division_id,
          project_type: (patch.project_type as string) ?? (prev.project_type as string) ?? "other",
          task_type: (patch.task_type as string) ?? prev.task_type,
        }).catch(() => {});
      }

      // Side-effects: completion reward + overdue alert
      if (prev && patch.status === "completed" && prev.status !== "completed") {
        const planned = prev.planned_end_date;
        const actualEnd = (patch.actual_end_date as string | undefined) ?? new Date().toISOString().slice(0, 10);
        if (planned && actualEnd <= planned) {
          await supabase.from("reward_notifications").insert({
            company_id: prev.company_id,
            project_id: prev.project_id,
            task_id: prev.id,
            message: `Nice work — "${prev.title}" finished on time! 🎉`,
          });
        }
      }
      if (prev && (patch.status === "blocked" || (patch.planned_end_date && patch.status !== "completed"))) {
        const planned = (patch.planned_end_date as string | undefined) ?? prev.planned_end_date;
        const status = (patch.status as string | undefined) ?? prev.status;
        if (planned && status !== "completed" && status !== "cancelled" && new Date(planned) < new Date(new Date().toDateString())) {
          await supabase.from("alerts").insert({
            company_id: prev.company_id,
            project_id: prev.project_id,
            division_id: prev.division_id,
            task_id: prev.id,
            kind: "task_overdue",
            severity: "warning",
            message: `Task "${prev.title}" is overdue.`,
          });
        }
      }

      return { projectId: projectId ?? prev?.project_id };
    },
    onSuccess: (res) => { invalidateProjectScopes(qc, res?.projectId ?? undefined); toast.success("Tarea guardada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

export const useCreateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskInsert) => {
      const { error } = await supabase.from("tasks").insert(payload);
      if (error) throw error;
      if (payload.assigned_worker_id) {
        await recordAssignmentPattern({
          worker_id: payload.assigned_worker_id,
          company_id: payload.company_id,
          division_id: payload.division_id,
          project_type: (payload.project_type as string) ?? "other",
          task_type: payload.task_type ?? null,
        }).catch(() => {});
      }
      return payload.project_id;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid as string); toast.success("Tarea agregada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar la tarea"),
  });
};

export const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId?: string }) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid as string | undefined); toast.success("Tarea eliminada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

export const useReorderTasks = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ordered, projectId }: { ordered: { id: string; position: number }[]; projectId?: string }) => {
      // Update sequentially to avoid conflicts
      for (const row of ordered) {
        const { error } = await supabase.from("tasks").update({ position: row.position }).eq("id", row.id);
        if (error) throw error;
      }
      return projectId;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid as string | undefined); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo reordenar"),
  });
};

// Estimate items
export const useUpdateEstimateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, projectId }: { id: string; patch: EstimateItemUpdate; projectId?: string }) => {
      const { error } = await supabase.from("estimate_items").update(patch).eq("id", id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid as string | undefined); toast.success("Partida guardada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

export const useDeleteEstimateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId?: string }) => {
      const { error } = await supabase.from("estimate_items").delete().eq("id", id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid as string | undefined); toast.success("Partida eliminada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

export const useAddEstimateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      // find or create estimate for project
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      const company_id = profile?.company_id;
      if (!company_id) throw new Error("No company");

      const { data: project } = await supabase.from("projects").select("division_id").eq("id", projectId).single();
      if (!project) throw new Error("Project not found");

      let { data: est } = await supabase.from("estimates").select("id").eq("project_id", projectId).limit(1).maybeSingle();
      if (!est) {
        const { data: newEst, error: ce } = await supabase.from("estimates").insert({
          company_id, division_id: project.division_id, project_id: projectId, source: "manual", total: 0, imported_by: user.id,
        }).select("id").single();
        if (ce) throw ce;
        est = newEst;
      }
      const { data: existing } = await supabase.from("estimate_items").select("position").eq("estimate_id", est.id).order("position", { ascending: false }).limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const payload: EstimateItemInsert = {
        estimate_id: est.id, company_id, description: "New item", category: null,
        quantity: 1, unit: null, unit_price: 0, total: 0, position: nextPos,
      };
      const { error } = await supabase.from("estimate_items").insert(payload);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateProjectScopes(qc, pid); toast.success("Partida agregada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar la partida"),
  });
};

// Workers
export const useCreateWorker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<WorkerInsert, "company_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile?.company_id) throw new Error("No company");
      const { error } = await supabase.from("workers").insert({ ...payload, company_id: profile.company_id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workers"] }); toast.success("Ayudante agregado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar el ayudante"),
  });
};

export const useUpdateWorker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: WorkerUpdate }) => {
      const { error } = await supabase.from("workers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workers"] }); toast.success("Ayudante guardado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

// Clients
export const useCreateClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<ClientInsert, "company_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile?.company_id) throw new Error("No company");
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...payload, company_id: profile.company_id })
        .select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Cliente agregado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar el cliente"),
  });
};

export const useUpdateClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ClientUpdate }) => {
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Cliente guardado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

// Project count per client (used for naming)
export const useClientProjectCount = (clientId: string | undefined) =>
  useQuery({
    enabled: !!clientId,
    queryKey: ["client-project-count", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("projects").select("id", { count: "exact", head: true }).eq("client_id", clientId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

export const useClientProjects = (clientId: string | undefined) =>
  useQuery({
    enabled: !!clientId,
    queryKey: ["client-projects", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id, name, status, created_at")
        .eq("client_id", clientId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

// Worker assignment patterns -> suggestions
export const useWorkerSuggestions = (params: {
  divisionId?: string | null;
  projectType?: string | null;
  taskType?: string | null;
}) =>
  useQuery({
    enabled: !!(params.divisionId || params.projectType || params.taskType),
    queryKey: ["worker-suggestions", params],
    queryFn: async () => {
      let q = supabase
        .from("task_assignment_patterns")
        .select("*, workers(id, name, trade, active)")
        .order("times_assigned", { ascending: false })
        .limit(8);
      if (params.divisionId) q = q.eq("division_id", params.divisionId);
      if (params.projectType) q = q.eq("project_type", params.projectType as any);
      if (params.taskType) q = q.eq("task_type", params.taskType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.workers?.active);
    },
  });

// Record an assignment so we can suggest later
export const recordAssignmentPattern = async (input: {
  worker_id: string;
  company_id: string;
  division_id: string;
  project_type: string;
  task_type: string | null | undefined;
}) => {
  if (!input.task_type) return;
  // Find existing pattern row
  const { data: existing } = await supabase
    .from("task_assignment_patterns")
    .select("id, times_assigned")
    .eq("worker_id", input.worker_id)
    .eq("company_id", input.company_id)
    .eq("division_id", input.division_id)
    .eq("project_type", input.project_type as any)
    .eq("task_type", input.task_type)
    .maybeSingle();

  if (existing) {
    await supabase.from("task_assignment_patterns").update({
      times_assigned: (existing.times_assigned ?? 1) + 1,
      last_used_at: new Date().toISOString(),
      confidence: Math.min(1, ((existing.times_assigned ?? 1) + 1) / 5),
    }).eq("id", existing.id);
  } else {
    await supabase.from("task_assignment_patterns").insert({
      worker_id: input.worker_id,
      company_id: input.company_id,
      division_id: input.division_id,
      project_type: input.project_type as any,
      task_type: input.task_type,
      times_assigned: 1,
      confidence: 0.2,
    });
  }
};

// ============ EXPENSES / PAYMENTS / VENDORS / CATEGORIES ============

type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

const invalidateFinanceScopes = (qc: ReturnType<typeof useQueryClient>, projectId?: string | null) => {
  qc.invalidateQueries({ queryKey: ["expenses"] });
  qc.invalidateQueries({ queryKey: ["expense-review-queue"] });
  qc.invalidateQueries({ queryKey: ["payments"] });
  qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  if (projectId) qc.invalidateQueries({ queryKey: ["financials", projectId] });
};

const getCompanyId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) throw new Error("No company");
  return { companyId: profile.company_id, userId: user.id };
};

export const useVendors = () =>
  useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useCategories = (kind: "expense" | "payment" = "expense") =>
  useQuery({
    queryKey: ["categories", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("kind", kind).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

const _norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export const useCreateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { companyId } = await getCompanyId();
      const clean = name.trim();
      // Evita duplicados con distinta capitalización/acentos
      const { data: existing } = await supabase.from("vendors").select("*").eq("company_id", companyId);
      const target = _norm(clean);
      const dup = (existing ?? []).find((v: any) => _norm(v.name) === target);
      if (dup) return dup;
      const { data, error } = await supabase.from("vendors").insert({ company_id: companyId, name: clean }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar el proveedor"),
  });
};

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, kind = "expense" }: { name: string; kind?: "expense" | "payment" }) => {
      const { companyId } = await getCompanyId();
      const clean = name.trim();
      const { data: existing } = await supabase.from("categories").select("*").eq("company_id", companyId).eq("kind", kind);
      const target = _norm(clean);
      const dup = (existing ?? []).find((c: any) => _norm(c.name) === target);
      if (dup) return dup;
      const { data, error } = await supabase.from("categories").insert({ company_id: companyId, name: clean, kind }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["categories", v.kind ?? "expense"] }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar la categoría"),
  });
};

// ---- Expenses ----
export const useExpenses = (opts?: { projectId?: string }) =>
  useQuery({
    queryKey: ["expenses", opts?.projectId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*, vendors(name), categories(name), projects(name), divisions(name), workers(id, name, trade)")
        .order("spent_on", { ascending: false });
      if (opts?.projectId) q = q.eq("project_id", opts.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export type ExpenseReviewQueueRow = {
  expense_id: string;
  issues: string[];
};

export const useExpenseReviewQueue = (projectId?: string) =>
  useQuery({
    queryKey: ["expense-review-queue", projectId ?? "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("expense_review_queue", {
        p_project_id: projectId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as ExpenseReviewQueueRow[];
    },
  });


export const useCreateExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<ExpenseInsert, "company_id" | "created_by">) => {
      const { companyId, userId } = await getCompanyId();
      const { data, error } = await supabase.from("expenses").insert({ ...payload, company_id: companyId, created_by: userId }).select("id, project_id").single();
      if (error) throw error;
      return data as { id: string; project_id: string | null };
    },
    onSuccess: (res) => { invalidateFinanceScopes(qc, res?.project_id as string | null | undefined); toast.success("Gasto agregado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo agregar el gasto"),
  });
};

export const useUpdateExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ExpenseUpdate }) => {
      const { data, error } = await supabase
        .from("expenses")
        .update(patch)
        .eq("id", id)
        .select("*, vendors(name), categories(name), projects(name), divisions(name), workers(id, name, trade)")
        .single();

      if (error) throw error;
      if (!data?.id) {
        throw new Error("No se guardó el gasto: no tienes permiso para editarlo o ya no existe. Recarga la página e intenta de nuevo.");
      }
      return data;
    },
    onSuccess: (saved) => {
      qc.setQueriesData({ queryKey: ["expenses"] }, (current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((row: any) => row.id === saved.id ? saved : row);
      });

      // The UPDATE response is the authoritative row for the editor/list.
      // Mark expense queries stale without immediately refetching and replacing
      // the just-saved row during the same interaction.
      qc.invalidateQueries({ queryKey: ["expenses"], refetchType: "none" });
      qc.invalidateQueries({ queryKey: ["expense-review-queue"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      if (saved.project_id) qc.invalidateQueries({ queryKey: ["financials", saved.project_id] });

      toast.success("Gasto guardado");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

export const useDeleteExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId?: string | null }) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateFinanceScopes(qc, pid); toast.success("Gasto eliminado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

// ---- Payments ----
export const usePayments = (opts?: { projectId?: string }) =>
  useQuery({
    queryKey: ["payments", opts?.projectId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*, clients(name), projects(name), divisions(name)")
        .order("received_on", { ascending: false });
      if (opts?.projectId) q = q.eq("project_id", opts.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const useCreatePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<PaymentInsert, "company_id" | "created_by">) => {
      const { companyId, userId } = await getCompanyId();
      const { data, error } = await supabase
        .from("payments")
        .insert({ ...payload, company_id: companyId, created_by: userId })
        .select("id, project_id")
        .single();
      if (error) throw error;
      return data as { id: string; project_id: string | null };
    },
    onSuccess: (res) => { invalidateFinanceScopes(qc, res?.project_id as string | null | undefined); toast.success("Cobro registrado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo registrar el cobro"),
  });
};

export const useUpdatePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PaymentUpdate }) => {
      const { error } = await supabase.from("payments").update(patch).eq("id", id);
      if (error) throw error;
      return patch.project_id as string | null | undefined;
    },
    onSuccess: (pid) => { invalidateFinanceScopes(qc, pid); toast.success("Cobro guardado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });
};

export const useDeletePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId?: string | null }) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (pid) => { invalidateFinanceScopes(qc, pid); toast.success("Cobro eliminado"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

// ============ RECEIPTS ============

const RECEIPTS_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
// HEIC/HEIF se acepta porque iPhone los toma por defecto; se convierten a JPEG en cliente vía prepareReceiptFile().
export const RECEIPT_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export const getReceiptMimeType = (file: File) => {
  const lowerName = file.name.toLowerCase();
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf" || lowerName.endsWith(".pdf")) return "application/pdf";
  if (["image/jpeg", "image/jpg"].includes(t) || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (t === "image/png" || lowerName.endsWith(".png")) return "image/png";
  if (t === "image/heic" || t === "image/heif" || lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) return "image/heic";
  return file.type;
};

export const parseReceiptStoragePath = (value?: string | null) => {
  if (!value) return null;
  const raw = decodeURIComponent(value.trim());
  const storageMatch = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/([^?]+)/);
  const path = storageMatch?.[1] ?? (raw.startsWith("http") ? null : raw);
  if (!path) return null;
  return path.replace(/^\/+/, "").replace(/^receipts\//, "");
};

export const createReceiptObjectUrl = async ({
  storagePath,
  fileUrl,
  mimeType,
}: {
  storagePath?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
}) => {
  const path = parseReceiptStoragePath(storagePath) ?? parseReceiptStoragePath(fileUrl);
  if (!path) throw new Error("This receipt needs to be re-uploaded.");

  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).download(path);
  if (error) throw error;

  const blob = new Blob([data], { type: mimeType || data.type || "application/octet-stream" });
  return { url: URL.createObjectURL(blob), blob, path };
};

export type ReceiptStatusValue =
  | "uploaded"
  | "needs_review"
  | "linked_to_project"
  | "ready_to_convert"
  | "converted_to_expense"
  | "rejected";

export const useReceipts = (opts?: {
  projectId?: string;
  expenseId?: string;
  unlinkedOnly?: boolean;
  status?: ReceiptStatusValue | "all" | "inbox";
}) =>
  useQuery({
    queryKey: [
      "receipts",
      opts?.projectId ?? "all",
      opts?.expenseId ?? "any",
      opts?.unlinkedOnly ? "unlinked" : "any2",
      opts?.status ?? "all",
    ],
    queryFn: async () => {
      // Use explicit FK hints so PostgREST embeds never break if FKs are renamed
      // or temporarily missing — and fall back to a flat select if any embed fails.
      const buildQuery = (select: string) => {
        let q = supabase.from("receipts").select(select).order("created_at", { ascending: false });
        if (opts?.expenseId) q = q.eq("expense_id", opts.expenseId);
        if (opts?.unlinkedOnly) q = q.is("expense_id", null);
        if (opts?.status && opts.status !== "all" && opts.status !== "inbox") {
          q = q.eq("status", opts.status);
        }
        return q;
      };

      const embeddedSelect = [
        "*",
        "expenses!receipts_expense_id_fkey(id, amount, spent_on, project_id, projects(id, name))",
        "projects!receipts_project_id_fkey(id, name)",
        "vendors!receipts_vendor_id_fkey(id, name)",
        "categories!receipts_category_id_fkey(id, name)",
        "divisions!receipts_division_id_fkey(id, name)",
      ].join(", ");

      let raw: any[] = [];
      const { data, error } = await buildQuery(embeddedSelect);
      if (error) {
        // Fallback: fetch the bare receipts and resolve related records client-side.
        // This guards against missing FKs, RLS hiccups on related tables, or schema drift.
        // We never want the inbox to crash because of a join issue.
        // eslint-disable-next-line no-console
        console.warn("[useReceipts] embedded select failed, falling back:", error.message);
        const { data: bare, error: bareErr } = await buildQuery("*");
        if (bareErr) throw bareErr;
        raw = (bare ?? []) as any[];

        const ids = (key: string) =>
          Array.from(new Set(raw.map((r) => r?.[key]).filter(Boolean))) as string[];
        const projectIds = ids("project_id");
        const vendorIds = ids("vendor_id");
        const categoryIds = ids("category_id");
        const divisionIds = ids("division_id");
        const expenseIds = ids("expense_id");

        const fetchByIds = async (table: string, list: string[]) => {
          if (list.length === 0) return new Map<string, any>();
          const { data: rows } = await supabase.from(table as any).select("*").in("id", list);
          return new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
        };

        const [projects, vendors, categories, divisions, expenses] = await Promise.all([
          fetchByIds("projects", projectIds),
          fetchByIds("vendors", vendorIds),
          fetchByIds("categories", categoryIds),
          fetchByIds("divisions", divisionIds),
          fetchByIds("expenses", expenseIds),
        ]);

        raw = raw.map((r) => ({
          ...r,
          projects: r.project_id ? projects.get(r.project_id) ?? null : null,
          vendors: r.vendor_id ? vendors.get(r.vendor_id) ?? null : null,
          categories: r.category_id ? categories.get(r.category_id) ?? null : null,
          divisions: r.division_id ? divisions.get(r.division_id) ?? null : null,
          expenses: r.expense_id ? expenses.get(r.expense_id) ?? null : null,
        }));
      } else {
        raw = (data ?? []) as any[];
      }

      // Normalize embedded rows so consumers can safely read `.name` etc.
      // PostgREST returns either an object, null, or (for some shapes) an array.
      const pickOne = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      let rows = raw.map((r) => ({
        ...r,
        projects: pickOne(r.projects),
        vendors: pickOne(r.vendors),
        categories: pickOne(r.categories),
        divisions: pickOne(r.divisions),
        expenses: r.expenses
          ? { ...pickOne(r.expenses), projects: pickOne(pickOne(r.expenses)?.projects) }
          : null,
      }));

      if (opts?.projectId) {
        rows = rows.filter(
          (r) => r.project_id === opts.projectId || r.expenses?.project_id === opts.projectId,
        );
      }
      if (opts?.status === "inbox") {
        rows = rows.filter((r) =>
          ["needs_review", "ready_to_convert", "linked_to_project", "uploaded"].includes(r.status),
        );
      }
      return rows;
    },
  });

export const useUploadReceipt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      expenseId,
      divisionId,
      projectId,
      fileHash,
      onProgress,
    }: {
      file: File;
      expenseId?: string | null;
      divisionId?: string | null;
      projectId?: string | null;
      fileHash?: string | null;
      onProgress?: (pct: number) => void;
    }) => {
      if (file.size > RECEIPT_MAX_BYTES) throw new Error("File exceeds 10 MB limit");
      const contentType = getReceiptMimeType(file);
      if (!RECEIPT_ALLOWED_MIME.includes(contentType)) throw new Error("Only JPG, PNG, or PDF allowed");
      const { companyId, userId } = await getCompanyId();

      let finalDivisionId = divisionId ?? null;
      let finalProjectId = projectId ?? null;
      if (expenseId && (!finalDivisionId || !finalProjectId)) {
        const { data: ex } = await supabase.from("expenses").select("division_id, project_id").eq("id", expenseId).single();
        finalDivisionId = finalDivisionId ?? ex?.division_id ?? null;
        finalProjectId = finalProjectId ?? ex?.project_id ?? null;
      }

      onProgress?.(10);
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const projectSegment = finalProjectId ?? "unassigned";
      const path = `${companyId}/${projectSegment}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, file, { contentType, upsert: false });
      if (upErr) throw upErr;
      onProgress?.(70);

      const initialStatus: ReceiptStatusValue = expenseId
        ? "converted_to_expense"
        : "needs_review";

      const { data, error } = await supabase
        .from("receipts")
        .insert({
          company_id: companyId,
          division_id: finalDivisionId,
          project_id: finalProjectId,
          expense_id: expenseId ?? null,
          file_url: path,
          storage_path: path,
          file_name: file.name,
          mime_type: contentType,
          file_size: file.size,
          file_hash: fileHash ?? null,
          uploaded_by: userId,
          status: initialStatus,
        } as any)
        .select("*")
        .single();
      if (error) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
        throw error;
      }
      onProgress?.(100);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      toast.success("Recibo subido");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo subir el recibo"),
  });
};

// Update editable draft fields on a receipt (pre-conversion).
export const useUpdateReceipt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { data, error } = await supabase.from("receipts").update(patch as any).eq("id", id).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar el recibo"),
  });
};

export const useSetReceiptStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReceiptStatusValue }) => {
      const { userId } = await getCompanyId();
      const { error } = await supabase
        .from("receipts")
        .update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      toast.success("Recibo actualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar el recibo"),
  });
};

export const useLinkReceipt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expenseId }: { id: string; expenseId: string | null }) => {
      const { userId } = await getCompanyId();
      let divisionId: string | null = null;
      let projectId: string | null = null;
      let receiptUrl: string | null = null;
      if (expenseId) {
        const { data: ex } = await supabase.from("expenses").select("division_id, project_id, receipt_url").eq("id", expenseId).single();
        divisionId = ex?.division_id ?? null;
        projectId = ex?.project_id ?? null;
        receiptUrl = ex?.receipt_url ?? null;
      }
      const patch: any = {
        expense_id: expenseId,
        status: expenseId ? "converted_to_expense" : "needs_review",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      };
      if (divisionId) patch.division_id = divisionId;
      if (projectId) patch.project_id = projectId;
      const { data: receipt, error } = await supabase
        .from("receipts")
        .update(patch)
        .eq("id", id)
        .select("file_url, storage_path")
        .single();
      if (error) throw error;

      // Mirror onto expense.receipt_url if missing
      const receiptPath = (receipt as any)?.storage_path ?? receipt?.file_url;
      if (expenseId && !receiptUrl && receiptPath) {
        await supabase.from("expenses").update({ receipt_url: receiptPath }).eq("id", expenseId);
      }
      return projectId;
    },
    onSuccess: (pid) => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      invalidateFinanceScopes(qc, pid);
      toast.success("Recibo asociado");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo asociar el recibo"),
  });
};

// Find similar expenses for a receipt (project + vendor + amount within $0.01 + date within 3 days)
export const useDuplicateExpenseCheck = (input: {
  projectId?: string | null;
  vendorId?: string | null;
  amount?: number | null;
  spentOn?: string | null;
  excludeExpenseId?: string | null;
}) =>
  useQuery({
    queryKey: ["dup-expense", input.projectId ?? "x", input.vendorId ?? "x", input.amount ?? 0, input.spentOn ?? "x"],
    enabled: !!(input.amount && input.spentOn),
    queryFn: async () => {
      const date = input.spentOn!;
      const d = new Date(date);
      const minus = new Date(d); minus.setDate(d.getDate() - 3);
      const plus = new Date(d); plus.setDate(d.getDate() + 3);
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      let q = supabase
        .from("expenses")
        .select("id, amount, spent_on, vendor_id, project_id, vendors(name), projects(name)")
        .gte("spent_on", iso(minus))
        .lte("spent_on", iso(plus))
        .gte("amount", (input.amount! - 0.01))
        .lte("amount", (input.amount! + 0.01))
        .limit(5);
      if (input.projectId) q = q.eq("project_id", input.projectId);
      if (input.vendorId) q = q.eq("vendor_id", input.vendorId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (input.excludeExpenseId) rows = rows.filter((r) => r.id !== input.excludeExpenseId);
      return rows;
    },
  });

// Convert a receipt into a brand-new expense, then link them.
export const useConvertReceiptToExpense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      receiptId,
      payload,
    }: {
      receiptId: string;
      payload: {
        project_id: string | null;
        division_id: string;
        vendor_id: string | null;
        category_id: string;
        amount: number;
        spent_on: string;
        description?: string | null;
        worker_id?: string | null;
      };
    }) => {
      const { companyId, userId } = await getCompanyId();
      const { data: receipt, error: rErr } = await supabase
        .from("receipts")
        .select("file_url, storage_path, expense_id, status")
        .eq("id", receiptId)
        .single();
      if (rErr) throw rErr;
      if (receipt.expense_id || receipt.status === "converted_to_expense") {
        throw new Error("Este recibo ya está asociado a un gasto.");
      }

      const { data: expense, error: eErr } = await supabase
        .from("expenses")
        .insert({
          ...payload,
          company_id: companyId,
          created_by: userId,
          receipt_url: (receipt as any)?.storage_path ?? receipt?.file_url ?? null,
        })
        .select("id, project_id")
        .single();
      if (eErr) throw eErr;

      const { data: linkedReceipt, error: uErr } = await supabase
        .from("receipts")
        .update({
          expense_id: expense.id,
          status: "converted_to_expense",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          project_id: payload.project_id,
          division_id: payload.division_id,
        } as any)
        .eq("id", receiptId)
        .is("expense_id", null)
        .select("id")
        .maybeSingle();
      if (uErr || !linkedReceipt) {
        await supabase.from("expenses").delete().eq("id", expense.id);
        if (uErr) throw uErr;
        throw new Error("El recibo ya fue procesado. No se creó un gasto duplicado.");
      }

      return expense;
    },
    onSuccess: (exp: any) => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      invalidateFinanceScopes(qc, exp?.project_id ?? null);
      toast.success("Gasto creado desde el recibo");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo crear el gasto"),
  });
};

export const useReplaceReceiptFile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      receiptId,
      file,
      onProgress,
    }: {
      receiptId: string;
      file: File;
      onProgress?: (pct: number) => void;
    }) => {
      if (file.size > RECEIPT_MAX_BYTES) throw new Error("File exceeds 10 MB limit");
      const contentType = getReceiptMimeType(file);
      if (!RECEIPT_ALLOWED_MIME.includes(contentType)) throw new Error("Only JPG, PNG, or PDF allowed");
      const { companyId } = await getCompanyId();
      const { data: existing, error: gErr } = await supabase
        .from("receipts")
        .select("file_url, storage_path, project_id")
        .eq("id", receiptId)
        .single();
      if (gErr) throw gErr;

      onProgress?.(10);
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const projectSegment = (existing as any)?.project_id ?? "unassigned";
      const path = `${companyId}/${projectSegment}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, file, { contentType, upsert: false });
      if (upErr) throw upErr;
      onProgress?.(70);

      const { error } = await supabase
        .from("receipts")
        .update({
          file_url: path,
          storage_path: path,
          file_name: file.name,
          mime_type: contentType,
          file_size: file.size,
        })
        .eq("id", receiptId);
      if (error) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
        throw error;
      }
      // Best-effort: remove old file
      const oldPath = parseReceiptStoragePath((existing as any)?.storage_path) ?? parseReceiptStoragePath(existing?.file_url);
      if (oldPath) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([oldPath]);
      }
      onProgress?.(100);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      toast.success("Recibo reemplazado");
    },
    onError: (e: any) => toast.error(e.message ?? "Replace failed"),
  });
};

export const useDeleteReceipt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string }) => {
      const { error } = await supabase.from("receipts").delete().eq("id", id);
      if (error) throw error;
      const storagePath = parseReceiptStoragePath(path);
      if (storagePath) await supabase.storage.from(RECEIPTS_BUCKET).remove([storagePath]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-inbox-count"] }); // contador "Recibos por revisar" usa otra key
      toast.success("Recibo eliminado");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });
};

// Inbox count of receipts that still need attention. Surfaced on dashboard.
export const useReceiptsInboxCount = () =>
  useQuery({
    queryKey: ["receipts-inbox-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("id")
        .in("status", ["needs_review", "ready_to_convert", "linked_to_project", "uploaded"] as any);
      if (error) throw error;
      return countReceiptInboxRows(data);
    },
  });

