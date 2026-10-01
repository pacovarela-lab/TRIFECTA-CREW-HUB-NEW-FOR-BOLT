import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserRoles } from "@/hooks/useUserRoles";
import { isInternalTrifectaTenant } from "@/lib/tenant";

/**
 * Second barrier (UX/product) on top of RLS: internal Trifecta reconciliation
 * and import tools never render for another tenant, even via direct URL.
 * RLS remains the authoritative data boundary.
 */
export const InternalToolGuard = ({ children }: { children: JSX.Element }) => {
  const { companyId, loading } = useUserRoles();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isInternalTrifectaTenant(companyId)) return children;

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-3 p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-bold tracking-tight">Esta función no está disponible para tu cuenta.</h1>
        <p className="text-sm text-muted-foreground">
          Pregúntale a tu administrador si crees que deberías tener acceso.
        </p>
        <Button className="h-11 w-full" onClick={() => navigate("/", { replace: true })}>
          Ir al panel
        </Button>
      </CardContent>
    </Card>
  );
};
