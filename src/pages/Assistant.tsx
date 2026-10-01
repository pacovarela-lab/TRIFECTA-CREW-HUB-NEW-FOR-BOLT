import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Turn {
  q: string;
  a?: string;
  loading?: boolean;
}

const SUGGESTIONS = [
  "¿Cuánto gasté este mes?",
  "Top proveedores del año",
  "Gastos por categoría últimos 30 días",
  "Tareas atrasadas",
  "Pagos recibidos este mes",
];

const Assistant = () => {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { q, loading: true }]);
    setInput("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-query", { body: { question: q } });
      if (error) throw error;
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { q, a: data?.summary ?? "Sin resultados." } : x)));
    } catch (e: any) {
      toast.error(e?.message ?? "Error en la consulta");
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { q, a: "❌ No pude responder esa consulta." } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Asistente IA</h1>
      </div>
      <p className="text-sm text-muted-foreground">Pregunta en lenguaje natural sobre gastos, pagos y tareas.</p>

      {turns.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Sugerencias</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => ask(s)} disabled={busy}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <Card className="bg-muted/40">
              <CardContent className="p-3">
                <p className="text-sm font-medium">{t.q}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                {t.loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
                  </p>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{t.a}</pre>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="sticky bottom-20 flex gap-2 rounded-lg border bg-background p-2 shadow-md"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta algo…"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !input.trim()} size="icon">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
};

export default Assistant;
