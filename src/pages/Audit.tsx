import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Shield, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  metadata: any;
  created_at: string;
};

type ProfileLite = { id: string; email: string | null; full_name: string | null };

const ACTION_LABELS: Record<string, string> = {
  "user.invited": "Usuario invitado",
  "user.role_assigned": "Rol asignado",
  "user.role_changed": "Rol cambiado",
  "user.removed": "Usuario removido",
};

const Audit = () => {
  const { isAdmin, loading: rolesLoading, companyId } = useUserRoles();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    setRows(data || []);

    const userIds = Array.from(
      new Set((data || []).map((r) => r.user_id).filter(Boolean)),
    ) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p) => {
        map[p.id] = p as ProfileLite;
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) load();
  }, [companyId]);

  const actions = useMemo(() => {
    const set = new Set(rows.map((r) => r.action));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!q) return true;
      const u = r.user_id ? profiles[r.user_id] : null;
      const haystack = [
        r.action,
        r.entity_type,
        r.entity_id,
        u?.email,
        u?.full_name,
        JSON.stringify(r.metadata || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, actionFilter, profiles]);

  if (rolesLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">Solo administradores</p>
            <p className="text-sm text-muted-foreground">
              No tienes permiso para ver el historial de auditoría.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro de actividad de la empresa.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuario, acción o entidad…"
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a] || a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} registro{filtered.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin registros.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const u = r.user_id ? profiles[r.user_id] : null;
                return (
                  <li key={r.id} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {ACTION_LABELS[r.action] || r.action}
                      </Badge>
                      {r.entity_type && (
                        <span className="text-xs text-muted-foreground">
                          {r.entity_type}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">
                        {u?.full_name || u?.email || "Sistema"}
                      </span>
                      {r.metadata && Object.keys(r.metadata).length > 0 && (
                        <span className="text-muted-foreground">
                          {" — "}
                          {Object.entries(r.metadata)
                            .slice(0, 4)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(", ")}
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Audit;
