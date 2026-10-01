import { formatDistanceToNow } from "date-fns";
import { Sparkles, User, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useExpenseAudit } from "@/lib/expenseAudit";

function displayValue(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

export function ExpenseTraceability({ expenseId }: { expenseId?: string | null }) {
  const { data, isLoading } = useExpenseAudit(expenseId);
  if (!expenseId) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Trazabilidad</p>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} evento{(data?.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Cargando historial…</p>}
      {!isLoading && (!data || data.length === 0) && (
        <p className="text-xs text-muted-foreground">
          Sin correcciones ni reglas aplicadas todavía.
        </p>
      )}

      <div className="space-y-2">
        {(data ?? []).map((entry) => {
          const isRule = entry.action === "rule_applied";
          return (
            <Card key={entry.id} className="border-muted">
              <CardContent className="space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {isRule ? (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                        <Sparkles className="h-3 w-3" />
                        Regla aplicada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <User className="h-3 w-3" />
                        Corrección manual
                      </span>
                    )}
                    {isRule && entry.metadata?.rule_name && (
                      <span className="truncate text-muted-foreground">
                        · {entry.metadata.rule_name}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                </div>

                <ul className="space-y-1 pl-1 text-xs">
                  {(entry.metadata?.changes ?? []).map((c, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{c.label}:</span>
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through">
                        {displayValue(c.before)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">
                        {displayValue(c.after)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
