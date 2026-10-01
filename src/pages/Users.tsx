import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { Shield, UserPlus, Mail, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  { value: "admin", label: "Administrador", hint: "Acceso total" },
  { value: "manager", label: "Gerente", hint: "Gestión de proyectos y finanzas" },
  { value: "member", label: "Miembro", hint: "Uso general" },
  { value: "viewer", label: "Observador", hint: "Solo lectura" },
  { value: "field", label: "Campo", hint: "Operario de campo" },
];

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-destructive/10 text-destructive",
  manager: "bg-primary/10 text-primary",
  member: "bg-muted text-foreground",
  viewer: "bg-secondary text-secondary-foreground",
  field: "bg-success/10 text-success",
};

type Member = {
  id: string;
  email: string | null;
  full_name: string | null;
  roles: AppRole[];
};

type Invitation = {
  id: string;
  email: string;
  role: AppRole;
  status: string;
  created_at: string;
  accepted_at: string | null;
};

const Users = () => {
  const { isAdmin, loading: rolesLoading, companyId } = useUserRoles();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [profilesRes, rolesRes, invitesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("company_id", companyId),
      supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId),
      supabase
        .from("company_invitations")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);
    const rolesByUser: Record<string, AppRole[]> = {};
    (rolesRes.data || []).forEach((r: any) => {
      rolesByUser[r.user_id] = rolesByUser[r.user_id] || [];
      rolesByUser[r.user_id].push(r.role);
    });
    setMembers(
      (profilesRes.data || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        roles: rolesByUser[p.id] || [],
      })),
    );
    setInvitations((invitesRes.data || []) as Invitation[]);
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) load();
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.email, m.full_name].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [members, search]);

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error("Ingresa un email");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: email.trim(),
          role,
          full_name: fullName.trim() || null,
          redirect_to: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.warning) {
        toast.warning(result.warning);
      } else if (result?.mode === "linked_existing") {
        toast.success("Usuario existente agregado a la empresa");
      } else {
        toast.success("Invitación enviada por email");
      }
      setEmail("");
      setFullName("");
      setRole("member");
      setInviteOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error al invitar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (member: Member, newRole: AppRole) => {
    if (!companyId) return;
    if (member.roles.includes(newRole) && member.roles.length === 1) return;
    // Replace roles: delete existing, insert new
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", member.id)
      .eq("company_id", companyId);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: member.id, company_id: companyId, role: newRole });
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      company_id: companyId,
      action: "user.role_changed",
      entity_type: "user",
      entity_id: member.id,
      metadata: { from: member.roles, to: newRole, email: member.email },
    });
    toast.success("Rol actualizado");
    await load();
  };

  const handleRevokeInvitation = async (inv: Invitation) => {
    const { error } = await supabase
      .from("company_invitations")
      .update({ status: "revoked" })
      .eq("id", inv.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invitación revocada");
    await load();
  };

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
              No tienes permiso para gestionar usuarios.
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
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona miembros, roles e invitaciones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
            <SheetTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" /> Invitar
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Invitar usuario</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="inv-email">Email *</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="persona@empresa.com"
                  />
                </div>
                <div>
                  <Label htmlFor="inv-name">Nombre (opcional)</Label>
                  <Input
                    id="inv-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <Label>Rol</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          <div>
                            <div className="font-medium">{r.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.hint}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleInvite}
                  disabled={submitting}
                  className="w-full"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {submitting ? "Enviando…" : "Enviar invitación"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Si el email ya está registrado, se agregará directamente a tu
                  empresa con el rol seleccionado.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar miembros…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Miembros ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin miembros.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((m) => {
                const primaryRole = (m.roles[0] || "member") as AppRole;
                return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {m.full_name || m.email || "Sin nombre"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.roles.length > 0 && (
                        <Badge
                          className={ROLE_COLORS[primaryRole] || ""}
                          variant="secondary"
                        >
                          {primaryRole}
                        </Badge>
                      )}
                      <Select
                        value={primaryRole}
                        onValueChange={(v) =>
                          handleChangeRole(m, v as AppRole)
                        }
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Invitaciones ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-2 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(inv.created_at), "yyyy-MM-dd HH:mm")} ·{" "}
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {inv.role}
                      </Badge>
                    </p>
                  </div>
                  <Badge
                    variant={
                      inv.status === "accepted"
                        ? "default"
                        : inv.status === "revoked"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {inv.status}
                  </Badge>
                  {inv.status === "pending" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRevokeInvitation(inv)}
                      title="Revocar"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Users;
