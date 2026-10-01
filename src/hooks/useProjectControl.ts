/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectFinancials, useEstimateItems } from "@/hooks/useTrifectaData";
import { computeProjectControl, type ProjectControlResult, type AreaBudgets } from "@/lib/projectControl";
import { toast } from "sonner";

export const useProjectControl = (projectId: string | undefined) => {
  const { data: fin } = useProjectFinancials(projectId);
  const { data: estimateItems } = useEstimateItems(projectId);

  return useQuery<ProjectControlResult | null>({
    enabled: !!projectId && !!fin,
    queryKey: ["project-control", projectId],
    queryFn: async () => {
      if (!projectId || !fin) return null;

      const { data: revision } = await supabase
        .from("project_budget_revisions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const revisedBudget: AreaBudgets | null = revision
        ? {
            materials: Number(revision.revised_materials),
            labor: Number(revision.revised_labor),
            other: Number(revision.revised_other),
            collections: Number(revision.revised_collections),
          }
        : null;

      return computeProjectControl({
        estimateItems: (estimateItems ?? []) as any[],
        estimatedTotal: fin.estimateTotal,
        revisedBudget,
        actuals: {
          materials: fin.materials,
          labor: fin.labor,
          other: fin.other,
          collections: fin.collected,
        },
        overhead: fin.overhead,
      });
    },
  });
};

export const useProjectRecommendations = (projectId: string | undefined) => {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["project-recommendations", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_ai_recommendations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useGenerateRecommendations = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (control: ProjectControlResult) => {
      if (!projectId) throw new Error("Missing project ID");

      // Only generate when there are orange/red areas
      const problemAreas = control.areas.filter((a) => a.status !== "green");
      if (problemAreas.length === 0) {
        toast.info("Todo está sano. No hay recomendaciones que generar.");
        return [];
      }

      // Call the edge function that uses OpenAI
      const { data: projectRow } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .maybeSingle();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-financial-review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectName: projectRow?.name ?? "Proyecto",
            overallStatus: control.overallStatus,
            deviations: control.areas.map((a) => ({
              area: a.area,
              status: a.status,
              budget: a.budget,
              actual: a.actual,
              deviation: a.deviation,
              deviation_pct: a.deviationPct,
              message: a.message,
            })),
            margin: control.margin,
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `Error ${response.status}`);
      }

      const { recommendations } = await response.json();
      if (!recommendations || recommendations.length === 0) {
        toast.info("No se pudieron generar recomendaciones.");
        return [];
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();

      const companyId = profile?.company_id;
      if (!companyId) throw new Error("No company found");

      const rows = recommendations.map((r: any) => ({
        project_id: projectId,
        company_id: companyId,
        area: r.area,
        severity: r.severity,
        explanation: r.explanation,
        problem_area: r.problem_area,
        margin_impact: r.margin_impact,
        recommended_actions: JSON.stringify(r.recommended_actions),
        status: "pending",
      }));

      const { error } = await supabase
        .from("project_ai_recommendations")
        .insert(rows);
      if (error) throw error;
      return recommendations;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-recommendations", projectId] });
      toast.success("Revisión AI generada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo generar la revisión"),
  });
};

export const useAcceptRecommendation = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recId, actionIndex, revisedBudget }: {
      recId: string;
      actionIndex: number;
      revisedBudget?: AreaBudgets;
    }) => {
      const { error: updateErr } = await supabase
        .from("project_ai_recommendations")
        .update({
          status: "accepted",
          accepted_action_index: actionIndex,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", recId);
      if (updateErr) throw updateErr;

      if (revisedBudget && projectId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle();

        const { error: revErr } = await supabase
          .from("project_budget_revisions")
          .insert({
            project_id: projectId,
            company_id: profile?.company_id,
            revised_materials: revisedBudget.materials,
            revised_labor: revisedBudget.labor,
            revised_other: revisedBudget.other,
            revised_collections: revisedBudget.collections,
            revision_reason: "Aceptada desde recomendación AI",
          });
        if (revErr) throw revErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-recommendations", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-control", projectId] });
      toast.success("Recomendación aceptada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo aceptar"),
  });
};

export const useRejectRecommendation = (projectId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recId: string) => {
      const { error } = await supabase
        .from("project_ai_recommendations")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
        })
        .eq("id", recId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-recommendations", projectId] });
      toast.success("Recomendación rechazada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo rechazar"),
  });
};
