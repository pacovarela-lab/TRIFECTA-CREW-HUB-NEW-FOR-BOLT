import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PLATFORM_NAME, PLATFORM_STAGE_LABEL } from "@/lib/tenant";

const Signup = () => {
  const { signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(email.trim(), password, fullName.trim() || undefined);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Cuenta creada");
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-primary text-primary-foreground">
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-success" />
            <p className="text-center text-lg font-bold leading-snug">
              Deja de adivinar si un trabajo te dejó dinero: Crew Hub te muestra cuánto ganaste realmente.
            </p>
            <p className="text-center text-xs font-semibold text-primary-foreground/70">
              Trabajos · Gastos · Cobros · Ayudantes · Ganancia
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
            <p className="text-sm text-primary-foreground/60">{PLATFORM_NAME} · {PLATFORM_STAGE_LABEL}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-card p-6 text-card-foreground shadow-2xl">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <Button type="submit" disabled={submitting} className="h-11 w-full text-base font-semibold">
              {submitting ? "Creando…" : "Crear cuenta"}
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="font-semibold text-foreground underline">Iniciar sesión</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;
