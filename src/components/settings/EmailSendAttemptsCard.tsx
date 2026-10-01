/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Attempt = {
  id: string;
  email_type: string;
  recipient: string;
  status: "pending" | "sent" | "failed";
  error_message: string | null;
  provider_message_id: string | null;
  attempts: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

const statusLabel: Record<Attempt["status"], string> = {
  pending: "En cola",
  sent: "Enviado",
  failed: "Fallido",
};

const statusVariant = (status: Attempt["status"]) =>
  status === "sent" ? "default" : status === "failed" ? "destructive" : "secondary";

export function EmailSendAttemptsCard() {
  const [rows, setRows] = useState<Attempt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("email_send_attempts")
        .select("id,email_type,recipient,status,error_message,provider_message_id,attempts,user_id,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      setRows((data ?? []) as Attempt[]);
      setDenied(false);
    } catch (error) {
      console.error("Email send attempts lookup failed", error);
      setDenied(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Envíos de correo</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Registro de cada intento de envío (confirmación, magic link, recuperación y alertas), con estado y fecha.
        </p>
        {loading && <p className="text-sm">Cargando…</p>}
        {!loading && denied && (
          <p className="text-sm text-muted-foreground">Solo los administradores pueden ver el registro de envíos.</p>
        )}
        {!loading && !denied && rows?.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay intentos de envío registrados.</p>
        )}
        {!loading && !denied && !!rows?.length && (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.email_type}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.recipient}</p>
                  {row.status === "failed" && row.error_message && (
                    <p className="truncate text-xs text-destructive">{row.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                  <Badge variant={statusVariant(row.status) as any}>{statusLabel[row.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default EmailSendAttemptsCard;
