import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, Receipt, DollarSign, FileImage, Bell, Settings as SettingsIcon, ChevronRight, LogOut, BarChart3, Upload, MapPin, UserCog, ShieldCheck, Sparkles, Smartphone, Database, BookOpen, Landmark, Wand2, Calculator } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import { useState } from "react";
import { isInternalTrifectaTenant, PLATFORM_NAME, PLATFORM_STAGE_LABEL } from "@/lib/tenant";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { useBetaFeedbackAdmin } from "@/hooks/useBetaFeedbackAdmin";
import { newFeedbackBadge } from "@/lib/betaAdmin";
import { MessageSquare, Inbox } from "lucide-react";


type MoreItem = { to: string; label: string; icon: typeof Users; hint: string; internal?: boolean };

const baseItems = [
  { to: "/assistant", label: "Asistente IA", icon: Sparkles, hint: "Pregunta sobre tus datos" },
  { to: "/calculator", label: "Calculadora de ganancia", icon: Calculator, hint: "Proyecta tu ganancia o arma un presupuesto rápido" },
  { to: "/workers", label: "Ayudantes", icon: Users, hint: "Tu equipo de trabajo" },
  { to: "/checkins", label: "Registro de horas", icon: MapPin, hint: "Quién estuvo trabajando" },
  { to: "/expenses", label: "Gastos", icon: Receipt, hint: "Lo que gastaste en tus trabajos" },
  { to: "/payments", label: "Cobros", icon: DollarSign, hint: "Dinero que recibiste" },
  { to: "/receipts", label: "Recibos", icon: FileImage, hint: "Toma una foto y revisa el gasto" },
  { to: "/reports", label: "Reportes", icon: BarChart3, hint: "Detalle y exportaciones" },
  { to: "/ledger", label: "Estado de cuenta", icon: BookOpen, hint: "Saldo por cliente", internal: true },
  { to: "/bank", label: "Conciliación bancaria", icon: Landmark, hint: "Subir CSV del banco y cruzar gastos/pagos", internal: true },
  { to: "/import-trifecta-os", label: "Importar Trifecta OS", icon: Database, hint: "Subir archivo para revisión antes de importar" , internal: true },
  { to: "/import-v10", label: "Importación financiera V10", icon: Database, hint: "Subir paquete ZIP V10 y validar antes de importar" , internal: true },
  { to: "/import-review", label: "Revisar importaciones", icon: Database, hint: "Confirmar, editar o excluir filas antes de crear registros" , internal: true },
  { to: "/import-rules", label: "Reglas de importación", icon: Wand2, hint: "Autoclasificar movimientos repetitivos al subir un archivo" , internal: true },
  { to: "/import-data", label: "Importación masiva", icon: Upload, hint: "Importar datos de CSV / Excel" , internal: true },
  { to: "/alerts", label: "Avisos", icon: Bell, hint: "Pendientes y trabajos que necesitan atención" },
];

const adminItems = [
  { to: "/users", label: "Usuarios", icon: UserCog, hint: "Invitar y asignar roles" },
  { to: "/audit", label: "Auditoría", icon: ShieldCheck, hint: "Historial de actividad", internal: true },
];

const tailItems = [
  { to: "/install", label: "Instalar app", icon: Smartphone, hint: "Añadir a pantalla principal" },
];

const settingsItem = { to: "/settings", label: "Ajustes", icon: SettingsIcon, hint: "Preferencias de tu negocio" };

const financialRoutes = new Set(["/calculator", "/payments", "/reports", "/ledger", "/bank", "/expenses/discrepancies"]);

const More = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin, isManager, companyId, canSeeFinancials } = useUserRoles();
  const { isBetaAdmin, overview } = useBetaFeedbackAdmin();
  const internalTenant = isInternalTrifectaTenant(companyId);
  const canManage = isAdmin || isManager;
  const [searchParams] = useSearchParams();
  const [feedbackOpen, setFeedbackOpen] = useState(searchParams.get("feedback") === "1");
  const visible = (list: MoreItem[]) => list.filter((it) => (!it.internal || internalTenant) && (canSeeFinancials || !financialRoutes.has(it.to)));
  const newFeedback = newFeedbackBadge(isBetaAdmin, overview?.new_count ?? 0);
  const items = [
    ...visible(baseItems),
    ...(isAdmin ? visible(adminItems) : []),
    ...tailItems,
    // Settings holds personal preferences (profile, calendar), so every member needs it.
    { ...settingsItem, hint: canManage ? settingsItem.hint : "Tu perfil y preferencias" },
  ];


  const handleSignOut = async () => {
    await signOut();
    toast.success("Sesión cerrada");
    navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Herramientas y ajustes</p>
        <h1 className="text-2xl font-bold tracking-tight">Más</h1>
      </div>

      {user && (
        <Card>
          <CardContent className="p-4">
            <p className="eyebrow">Sesión iniciada como</p>
            <p className="mt-0.5 truncate font-bold">{user.email}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <Card key={it.to} role="button" onClick={() => navigate(it.to)} className="cursor-pointer transition-colors hover:bg-accent/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-muted p-2"><it.icon className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">{it.label}</p>
                <p className="truncate text-xs text-muted-foreground">{it.hint}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card role="button" onClick={() => setFeedbackOpen(true)} className="cursor-pointer transition-colors hover:bg-accent/40">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-muted p-2"><MessageSquare className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-bold">Reportar un problema</p>
            <p className="truncate text-xs text-muted-foreground">Cuéntanos cómo mejorar esta beta</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>

      {isBetaAdmin && (
        <Card role="button" onClick={() => navigate("/feedback")} className="cursor-pointer transition-colors hover:bg-accent/40">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-muted p-2"><Inbox className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">Bandeja de feedback</p>
              <p className="truncate text-xs text-muted-foreground">Feedback de beta de todas las empresas</p>
            </div>
            {newFeedback > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{newFeedback}</span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}



      <p className="pt-1 text-center text-[11px] text-muted-foreground">{PLATFORM_NAME} · {PLATFORM_STAGE_LABEL}</p>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <Button onClick={handleSignOut} variant="destructive" className="h-12 w-full rounded-xl text-sm font-bold tracking-wide">
        <LogOut className="mr-2 h-5 w-5" /> Cerrar sesión
      </Button>
    </div>
  );
};


export default More;
