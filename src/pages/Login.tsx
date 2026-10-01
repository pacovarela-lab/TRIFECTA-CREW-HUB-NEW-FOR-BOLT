import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { HardHat } from "lucide-react";
import { PLATFORM_NAME, PLATFORM_STAGE_LABEL } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";

const Login = () => {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const errorFields = ["error", "error_code", "error_description", "error_uri"];
    if (!errorFields.some((key) => url.searchParams.has(key) || hash.has(key))) return;
    toast.error("No se pudo iniciar sesión con Google");
    // Provider error details may contain sensitive data; show only a safe message.
    errorFields.forEach((key) => { url.searchParams.delete(key); hash.delete(key); });
    url.hash = hash.toString();
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (error || !data.url) {
        toast.error("No se pudo iniciar sesión con Google");
        setGoogleLoading(false);
        return;
      }
      // Supabase redirects to Google. The restored session returns the user to /.
    } catch {
      toast.error("No se pudo iniciar sesión con Google");
      setGoogleLoading(false);
    }
  };

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      const lower = error.toLowerCase();
      if (lower.includes("invalid")) toast.error("Correo o contraseña incorrectos");
      else if (lower.includes("email not confirmed")) toast.error("Confirma tu correo antes de iniciar sesión");
      else toast.error(error);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <HardHat className="h-8 w-8" aria-hidden />
            </div>
            <p className="eyebrow">
              {PLATFORM_NAME} · {PLATFORM_STAGE_LABEL}
            </p>
            <p className="max-w-sm text-center text-lg font-bold leading-snug text-foreground">
              Deja de adivinar si un trabajo te dejó dinero: Crew Hub te muestra cuánto ganaste realmente.
            </p>
            <p className="text-center text-xs font-semibold text-muted-foreground">
              Trabajos · Gastos · Cobros · Ayudantes · Ganancia
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Inicia sesión</h1>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="eyebrow">Correo</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="eyebrow">Contraseña</Label>
                <Link to="/forgot-password" className="text-[11px] font-semibold text-foreground underline underline-offset-2">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl text-sm font-bold tracking-wide">
              {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-card px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">o</span></div>
            </div>
            <Button type="button" variant="outline" onClick={onGoogle} disabled={googleLoading} className="h-12 w-full gap-2 rounded-xl border-2 text-sm font-semibold hover:bg-accent hover:text-accent-foreground transition-colors">
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              {googleLoading ? "Conectando…" : "Continuar con Google"}
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground">
              ¿No tienes cuenta?{" "}
              <Link to="/signup" className="font-semibold text-foreground underline underline-offset-2">Crear una</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

