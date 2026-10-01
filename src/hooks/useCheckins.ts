/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const getCtx = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para continuar");
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) throw new Error("No se encontró tu empresa");
  return { companyId: profile.company_id, userId: user.id };
};

export const useCheckins = (opts?: { openOnly?: boolean; projectId?: string; date?: string }) =>
  useQuery({
    queryKey: ["worker-checkins", opts ?? {}],
    queryFn: async () => {
      let q = supabase
        .from("worker_checkins")
        .select("*")
        .order("checked_in_at", { ascending: false })
        .limit(200);
      if (opts?.openOnly) q = q.is("checked_out_at", null);
      if (opts?.projectId) q = q.eq("project_id", opts.projectId);
      if (opts?.date) {
        const start = `${opts.date}T00:00:00`;
        const end = `${opts.date}T23:59:59`;
        q = q.gte("checked_in_at", start).lte("checked_in_at", end);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const ids = (key: "worker_id" | "project_id" | "division_id") =>
        [...new Set(rows.map((row) => row[key]).filter(Boolean))] as string[];
      const fetchNames = async (table: "workers" | "projects" | "divisions", values: string[]) => {
        if (values.length === 0) return new Map<string, Record<string, unknown>>();
        const { data: related, error: relatedError } = await supabase.from(table).select("id, name").in("id", values);
        if (relatedError) throw relatedError;
        return new Map((related ?? []).map((row) => [row.id, row]));
      };
      const [workers, projects, divisions] = await Promise.all([
        fetchNames("workers", ids("worker_id")),
        fetchNames("projects", ids("project_id")),
        fetchNames("divisions", ids("division_id")),
      ]);
      return rows.map((row) => ({
        ...row,
        workers: workers.get(row.worker_id) ?? null,
        projects: row.project_id ? projects.get(row.project_id) ?? null : null,
        divisions: row.division_id ? divisions.get(row.division_id) ?? null : null,
      }));
    },
  });

export const useCheckIn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { worker_id: string; project_id?: string | null; division_id?: string | null; latitude?: number | null; longitude?: number | null; notes?: string | null }) => {
      const { companyId, userId } = await getCtx();
      const { error } = await supabase.from("worker_checkins").insert({
        company_id: companyId,
        worker_id: input.worker_id,
        project_id: input.project_id ?? null,
        division_id: input.division_id ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        notes: input.notes ?? null,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["worker-checkins"] }); toast.success("Entrada registrada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo registrar la entrada"),
  });
};

export const useCheckOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("worker_checkins")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["worker-checkins"] }); toast.success("Salida registrada"); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo registrar la salida"),
  });
};
