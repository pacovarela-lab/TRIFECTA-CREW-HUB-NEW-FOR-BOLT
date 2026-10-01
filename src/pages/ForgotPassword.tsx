import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toastError } from "@/lib/errorToast";
import { HardHat } from "lucide-react";
import { PLATFORM_NAME, PLATFORM_STAGE_LABEL } from "@/lib/tenant";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Te enviamos un enlace de recuperación");
    } catch (err) {
      toastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-primary text-primary-foreground">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success text-sidebar"><HardHat className="h-8 w-8" aria-hidden /></div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/60">{PLATFORM_NAME} · {PLATFORM_STAGE_LABEL}</p>
            <h1 className="text-2xl font-bold tracking-tight">Recuperar contraseña</h1>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-card p-6 text-card-foreground shadow-2xl">
            {sent ? (
              <>
                <p className="text-sm">
                  Si <span className="font-semibold">{email}</span> existe, te enviamos un correo con un enlace para
                  restablecer la contraseña.
                </p>
                <Button type="button" className="h-11 w-full" onClick={() => navigate("/login")}>
                  Volver al inicio
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={submitting || !email.trim()} className="h-11 w-full text-base font-semibold">
                  {submitting ? "Enviando…" : "Enviar enlace"}
                </Button>
                <p className="pt-2 text-center text-xs text-muted-foreground">
                  <Link to="/login" className="font-semibold text-foreground underline">Volver a iniciar sesión</Link>
                </p>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
