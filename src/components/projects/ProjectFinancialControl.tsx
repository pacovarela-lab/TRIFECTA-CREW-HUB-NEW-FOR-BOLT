/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/format";
import {
  useProjectControl,
  useProjectRecommendations,
  useGenerateRecommendations,
  useAcceptRecommendation,
  useRejectRecommendation,
} from "@/hooks/useProjectControl";
import {
  healthLabel,
  healthColor,
  type HealthStatus,
  type AreaBudgets,
  type ControlArea,
} from "@/lib/projectControl";

type Props = {
  projectId: string;
};

const areaLabels: Record<string, string> = {
  materials: "Materiales",
  labor: "Mano de obra",
  other: "Otros",
  collections: "Cobros",
  margin: "Margen",
};

// Actions where the user must enter an explicit new budget amount
const actionsNeedingAmount = new Set(["charge_more", "reduce_expense"]);

export const ProjectFinancialControl = ({ projectId }: Props) => {
  const { data: control } = useProjectControl(projectId);
  const { data: recommendations } = useProjectRecommendations(projectId);
  const generate = useGenerateRecommendations(projectId);
  const acceptRec = useAcceptRecommendation(projectId);
  const rejectRec = useRejectRecommendation(projectId);
  const [expanded, setExpanded] = useState(false);

  if (!control) return null;

  const status = control.overallStatus;

  // Auto-expand when there are orange/red areas
  useEffect(() => {
    if (status !== "green") setExpanded(true);
  }, [status]);
  const pendingRecs = (recommendations ?? []).filter((r: any) => r.status === "pending");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className={cn("h-3 w-3 rounded-full", healthColor(status))} />
          <span className="text-sm font-bold">
            Estado financiero: {healthLabel(status)}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <>
          {control.messages.length > 0 && (
            <div className="space-y-1.5">
              {control.messages.map((msg, i) => (
                <p key={i} className="text-sm text-muted-foreground">{msg}</p>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t pt-2">
            {control.areas.map((area) => (
              <div key={area.area} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", healthColor(area.status as HealthStatus))} />
                  <span className="text-muted-foreground">{areaLabels[area.area] ?? area.area}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Plan {usd(area.budget)}
                  </span>
                  <span className="font-bold">{usd(area.actual)}</span>
                </div>
              </div>
            ))}
          </div>

          {status !== "green" && (
            <div className="border-t pt-3 space-y-2">
              {pendingRecs.length === 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full min-h-[44px]"
                  onClick={() => generate.mutate(control)}
                  disabled={generate.isPending}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar revisión AI
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Revisión AI
                  </p>
                  {pendingRecs.map((rec: any) => (
                    <RecommendationCard
                      key={rec.id}
                      rec={rec}
                      control={control}
                      onAccept={(actionIndex, revisedBudget) =>
                        acceptRec.mutate({ recId: rec.id, actionIndex, revisedBudget })
                      }
                      onReject={() => rejectRec.mutate(rec.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {(recommendations ?? []).some((r: any) => r.status !== "pending") && (
            <div className="border-t pt-2 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Historial
              </p>
              {(recommendations ?? [])
                .filter((r: any) => r.status !== "pending")
                .slice(0, 3)
                .map((rec: any) => (
                  <div key={rec.id} className="flex items-center gap-2 text-xs">
                    {rec.status === "accepted" ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="truncate text-muted-foreground">
                      {rec.problem_area}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const RecommendationCard = ({
  rec,
  control,
  onAccept,
  onReject,
}: {
  rec: any;
  control: any;
  onAccept: (actionIndex: number, revisedBudget?: AreaBudgets) => void;
  onReject: () => void;
}) => {
  const [selectedAction, setSelectedAction] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showAmountInput, setShowAmountInput] = useState(false);

  const actions: Array<{ type: string; label: string }> =
    typeof rec.recommended_actions === "string"
      ? JSON.parse(rec.recommended_actions)
      : rec.recommended_actions;

  const recArea = rec.area as ControlArea;
  const currentBudget = control.revisedBudget?.[recArea] ?? control.originalBudget[recArea] ?? 0;

  const handleSelectAction = (i: number) => {
    setSelectedAction(i);
    const action = actions[i];
    const needsAmount = action && actionsNeedingAmount.has(action.type) && recArea !== "margin";
    setShowAmountInput(needsAmount);
    if (!needsAmount) setCustomAmount("");
  };

  const handleAccept = () => {
    if (selectedAction === null) return;
    const chosenAction = actions[selectedAction];
    if (!chosenAction) return;

    // Margin never gets a direct revision
    if (recArea === "margin") {
      onAccept(selectedAction, undefined);
      return;
    }

    // Actions that do NOT create a budget revision — just mark accepted
    if (!actionsNeedingAmount.has(chosenAction.type)) {
      onAccept(selectedAction, undefined);
      return;
    }

    // Actions that need an explicit amount from the user
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      return; // Don't accept without a valid amount
    }

    const base: AreaBudgets = {
      materials: control.revisedBudget?.materials ?? control.originalBudget.materials,
      labor: control.revisedBudget?.labor ?? control.originalBudget.labor,
      other: control.revisedBudget?.other ?? control.originalBudget.other,
      collections: control.revisedBudget?.collections ?? control.originalBudget.collections,
    };

    const revised = { ...base, [recArea]: amount } as AreaBudgets;
    onAccept(selectedAction, revised);
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-sm font-bold">{rec.problem_area}</p>
      <p className="text-xs text-muted-foreground">{rec.explanation}</p>
      <p className="text-xs text-muted-foreground">
        Impacto en margen: {usd(Number(rec.margin_impact))}
      </p>
      <div className="space-y-1.5">
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelectAction(i)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
              selectedAction === i
                ? "border-success bg-success/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {selectedAction === i && <Check className="h-4 w-4 text-success" />}
            {action.label}
          </button>
        ))}
      </div>
      {showAmountInput && selectedAction !== null && (
        <div className="space-y-1.5 pt-1">
          <Label className="text-xs text-muted-foreground">
            Nuevo {areaLabels[recArea] ?? recArea}: plan actual {usd(currentBudget)}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Nuevo monto"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="min-h-[40px]"
          />
          <p className="text-xs text-muted-foreground">
            Escribe el nuevo objetivo para {areaLabels[recArea] ?? recArea}. No se copia ningún valor automáticamente.
          </p>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 min-h-[40px] bg-success text-success-foreground hover:bg-success/90"
          onClick={handleAccept}
          disabled={selectedAction === null || (showAmountInput && (!customAmount || parseFloat(customAmount) <= 0))}
        >
          Aceptar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-h-[40px]"
          onClick={onReject}
        >
          Rechazar
        </Button>
      </div>
    </div>
  );
};
