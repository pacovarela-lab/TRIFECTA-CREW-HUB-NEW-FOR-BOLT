import { useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FolderKanban, HardHat, LayoutDashboard, ListChecks, MoreHorizontal, Plus, Receipt, Upload, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuickActionsSheet } from "@/components/QuickActionsSheet";
import { QuickReceiptCapture } from "@/components/finance/QuickReceiptCapture";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { OfflineBanner } from "@/components/OfflineBanner";
import { TrialBanner } from "@/components/trial/TrialBanner";
import { useCurrentCompany } from "@/hooks/useBusinessUnits";
import { isInternalTrifectaTenant, tenantIdentity } from "@/lib/tenant";

const navIconColors: Record<string, string> = {
  "/projects": "[&>path:nth-child(2)]:stroke-blue-600 [&>path:nth-child(3)]:stroke-violet-600 [&>path:nth-child(4)]:stroke-teal-600",
  "/expenses": "[&>path:nth-child(2)]:stroke-red-600 [&>path:nth-child(3)]:stroke-red-600",
  "/tasks": "[&>path:nth-child(2)]:stroke-green-600 [&>path:nth-child(1)]:stroke-blue-600",
  "/more": "[&>circle:nth-child(3)]:stroke-blue-600 [&>circle:nth-child(1)]:stroke-violet-600 [&>circle:nth-child(2)]:stroke-pink-600",
};

const navItems = [
  { to: "/", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Trabajos", icon: FolderKanban },
  { to: "/expenses", label: "Gastos", icon: Receipt },
  { to: "/tasks", label: "Tareas", icon: ListChecks },
  { to: "/more", label: "Más", icon: MoreHorizontal },
];

export const AppLayout = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { data: company } = useCurrentCompany();
  const identity = tenantIdentity(company?.name);
  const internalTenant = isInternalTrifectaTenant(company?.id);
  const desktopNav = internalTenant
    ? [...navItems.slice(0, 2), { to: "/import", label: "Importar", icon: Upload }, ...navItems.slice(2)]
    : navItems;
  const desktopCols = desktopNav.length === 5 ? "grid-cols-5" : "grid-cols-4";
  const [actionsOpen, setActionsOpen] = useState(false);
  const [captureRequest, setCaptureRequest] = useState(0);
  const receiptCaptureTrigger = useRef<(() => void) | null>(null);
  useRealtimeUpdates();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner />
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar text-sidebar-foreground safe-top">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <button onClick={() => navigate("/")} className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-success">
              <HardHat className="h-4 w-4 text-sidebar" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-col items-start leading-none">
              <span className="max-w-[42vw] truncate text-sm font-bold tracking-tight">{identity.primary}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-sidebar-foreground/50">
                {identity.secondary}
              </span>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => { await signOut(); navigate("/login"); }}
            className="text-sidebar-foreground hover:bg-accent min-h-11 min-w-11"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-4 pb-28 pt-4">
        <TrialBanner />
        <Outlet />
      </main>

      {/* Desktop: single + button opens QuickActionsSheet */}
      <div className="hidden md:block">
        <button
          type="button"
          onClick={() => setActionsOpen(true)}
          aria-label="Acciones rápidas"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground shadow-xl transition active:scale-95 safe-bottom"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Desktop bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-sidebar-border bg-sidebar safe-bottom md:block">
        <div className={cn("mx-auto grid w-full max-w-5xl", desktopCols)}>
          {desktopNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-wide transition-colors",
                  isActive ? "text-success" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-success" />}
                  <item.icon className={cn("h-5 w-5", navIconColors[item.to])} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile bottom nav: Hoy | Trabajos | Gastos | Tareas | Más */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegación principal">
        <div className="mx-auto grid min-h-[68px] w-full grid-cols-5">
          {navItems.map((item) => (
            <MobileNavLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <QuickReceiptCapture captureRequest={captureRequest} captureTriggerRef={receiptCaptureTrigger} showButton={false} />
      <QuickActionsSheet open={actionsOpen} onOpenChange={setActionsOpen} receiptCaptureTrigger={receiptCaptureTrigger} />
    </div>
  );
};

type MobileNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

const MobileNavLink = ({ to, label, icon: Icon, end }: MobileNavItem) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      cn(
        "relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors",
        isActive ? "text-success" : "text-sidebar-foreground/65",
      )
    }
  >
    {({ isActive }) => (
      <>
        {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-success" />}
        <Icon className={cn("h-5 w-5", navIconColors[to])} />
        <span>{label}</span>
      </>
    )}
  </NavLink>
);
