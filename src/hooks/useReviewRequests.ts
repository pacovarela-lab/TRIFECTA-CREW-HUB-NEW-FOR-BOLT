/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReviewEntityType = "expense" | "payment" | "bank_tx";

const getCompanyAndUser = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Necesitas iniciar sesión.");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  if (!profile?.company_id) throw new Error("Tu cuenta no tiene empresa asignada.");
  return { companyId: profile.company_id as string, userId: user.id };
};

/** Members of the current company — used to pick who should review a record. */
export const useCompanyMembers = () =>
  useQuery({
    queryKey: ["company-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

/** Open review requests attached to a single record. */
export const useReviewRequestsFor = (entityType: ReviewEntityType, entityId?: string | null) =>
  useQuery({
    queryKey: ["review-requests", entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("review_requests")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Every review request of the company, newest first. */
export const useReviewRequests = (opts?: { onlyOpen?: boolean }) =>
  useQuery({
    queryKey: ["review-requests", "list", opts?.onlyOpen ? "open" : "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("review_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (opts?.onlyOpen) q = q.eq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

export const useCreateReviewRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entityType: ReviewEntityType;
      entityId: string;
      assignedTo: string;
      note?: string | null;
      summary?: string | null;
    }) => {
      const { companyId, userId } = await getCompanyAndUser();
      const { data, error } = await (supabase as any)
        .from("review_requests")
        .insert({
          company_id: companyId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          requested_by: userId,
          assigned_to: input.assignedTo,
          note: input.note?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Best-effort notification — the request is already saved if the email fails.
      try {
        await supabase.functions.invoke("review-request-notify", {
          body: { requestId: data.id, summary: input.summary ?? null },
        });
      } catch {
        /* ignored on purpose */
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-requests"] });
      toast.success("Revisión asignada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo asignar la revisión"),
  });
};

export const useResolveReviewRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("review_requests")
        .update({ status: "done", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-requests"] });
      toast.success("Revisión marcada como resuelta");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo cerrar la revisión"),
  });
};

/** Count of bank movements still waiting for a decision. */
export const usePendingBankCount = () =>
  useQuery({
    queryKey: ["bank-pending-count"],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .in("status", ["unmatched", "review"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
