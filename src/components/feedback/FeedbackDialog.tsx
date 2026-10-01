import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { buildFeedbackContext, formatFeedbackContext } from "@/lib/feedback";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional short technical hint prefilled from an error state. */
  prefill?: string;
  severity?: "low" | "medium" | "high" | null;
};

/**
 * Beta feedback capture. Reuses the existing `product_feedback` table; the
 * diagnostic context (route, timestamp, user agent, build) is appended to the
 * free-text comment so no schema change is needed. No secrets, tokens or
 * receipt contents are collected.
 */
export const FeedbackDialog = ({ open, onOpenChange, prefill, severity }: Props) => {
  const { user } = useAuth();
  const { companyId } = useUserRoles();
  const location = useLocation();
  const [comments, setComments] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Stable per-dialog-opening id: retries/double taps collapse to one row
  // thanks to the unique index on product_feedback.submission_id.
  const submissionId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      submissionId.current = crypto.randomUUID();
      if (prefill) setComments((c) => c || prefill);
    }
  }, [open, prefill]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!user || !companyId) {
      toast.error("Inicia sesión de nuevo para enviar feedback");
      return;
    }
    if (!comments.trim()) {
      toast.error("Describe el problema primero");
      return;
    }
    setSubmitting(true);
    const context = buildFeedbackContext({
      userId: user.id,
      companyId,
      route: location.pathname,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    const { error } = await supabase.from("product_feedback").insert({
      company_id: companyId,
      user_id: user.id,
      comments: `${comments.trim()}\n\n${formatFeedbackContext(context)}`,
      biggest_difficulty: difficulty.trim() || null,
      contact: contact.trim() || null,
      contact_permission: !!contact.trim(),
      route: context.route,
      app_version: context.appVersion,
      user_agent: context.userAgent,
      severity: severity ?? null,
      submission_id: submissionId.current,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setSubmitting(false);
    if (error) {
      // Duplicate submission (double tap / retry) is a success for the user.
      if (error.code === "23505") {
        toast.success("Gracias — tu feedback fue enviado");
        onOpenChange(false);
        return;
      }
      toast.error("No pudimos enviar tu feedback. Inténtalo de nuevo.");
      return;
    }
    toast.success("Gracias — tu feedback fue enviado");
    setComments("");
    setDifficulty("");
    setContact("");
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar un problema</DialogTitle>
          <DialogDescription>
            Cuéntanos qué salió mal o qué se puede mejorar. Adjuntamos la pantalla en la que estabas para poder reproducirlo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-comments">¿Qué pasó?</Label>
            <Textarea
              id="feedback-comments"
              required
              rows={5}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Describe el problema o sugerencia"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback-difficulty">Mayor dificultad (opcional)</Label>
            <Input id="feedback-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback-contact">Contacto para seguimiento (opcional)</Label>
            <Input id="feedback-contact" value={contact} onChange={(e) => setContact(e.target.value)} className="h-11" placeholder="Correo o teléfono" />
          </div>
          <p className="text-xs text-muted-foreground">
            Incluiremos información básica de la app y el dispositivo para ayudar a reproducir el problema.
          </p>
          <Button type="submit" disabled={submitting} className="h-11 w-full">
            {submitting ? "Enviando…" : "Enviar feedback"}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
};
