import { AlertCircle, Clock } from "lucide-react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { trialBadge } from "@/lib/trial";
import { cn } from "@/lib/utils";

/**
 * Active trial: discreet inline badge (louder at 7/3/1 days).
 * Expired trial: clear, non-technical read-only notice with a neutral CTA.
 */
export const TrialBanner = () => {
  const { snapshot } = useTrialStatus();
  if (!snapshot || snapshot.state === "exempt" || snapshot.state === "unknown") return null;

  if (snapshot.state === "expired") {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-semibold">Tu periodo de prueba terminó</p>
            <p className="text-muted-foreground">
              Tus datos están seguros y puedes seguir consultándolos. Contáctanos para volver a crear o editar.
            </p>
            <a
              className="inline-block font-semibold underline underline-offset-4"
              href="mailto:support@trifectaportal.app?subject=Activate%20my%20account"
            >
              Contáctanos para continuar
            </a>
          </div>
        </div>
      </div>
    );
  }

  const badge = trialBadge(snapshot);
  if (!badge) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        badge.urgent ? "font-semibold text-warning" : "text-muted-foreground",
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {badge.text}
    </div>
  );
};
