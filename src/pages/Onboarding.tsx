import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCreateBusinessAreas, useCreateCompany } from "@/hooks/useCreateCompany";
import {
  BUSINESS_AREA_EXAMPLES,
  COMMON_TIMEZONES,
  detectTimezone,
  isValidCompanyName,
  normalizeAreaNames,
} from "@/lib/onboarding";
import { Building2, Check, Layers, Plus, X } from "lucide-react";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { companyId, loading: membershipLoading, refresh } = useUserRoles();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companyName, setCompanyName] = useState("");
  const [timezone, setTimezone] = useState(detectTimezone());
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [areaDraft, setAreaDraft] = useState("");

  const createCompany = useCreateCompany();
  const createAreas = useCreateBusinessAreas();

  const timezoneOptions = useMemo(() => {
    const detected = detectTimezone();
    return Array.from(new Set([detected, ...COMMON_TIMEZONES]));
  }, []);

  if (!authLoading && !user) return <Navigate to="/login" replace />;
  // Already part of a company and not mid-wizard: nothing to onboard.
  if (!membershipLoading && companyId && !createdCompanyId) return <Navigate to="/" replace />;

  const submitCompany = async () => {
    if (!isValidCompanyName(companyName)) {
      toast.error("Escribe el nombre de tu empresa (mínimo 2 caracteres).");
      return;
    }
    try {
      const id = await createCompany.mutateAsync({ name: companyName, timezone });
      setCreatedCompanyId(id);
      await refresh();
      setStep(2);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(
        message.includes("already_member")
          ? "Tu usuario ya pertenece a una empresa."
          : "No pudimos crear la empresa. Intenta nuevamente.",
      );
    }
  };

  const addArea = () => {
    const next = normalizeAreaNames([...areas, areaDraft]);
    setAreas(next);
    setAreaDraft("");
  };

  const saveAreas = async () => {
    if (!createdCompanyId) return;
    try {
      if (areas.length > 0) {
        await createAreas.mutateAsync({ companyId: createdCompanyId, names: areas });
      }
      setStep(3);
    } catch {
      toast.error("No pudimos guardar las áreas. Puedes configurarlas después en Ajustes.");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="space-y-1 text-center">
          <p className="eyebrow">Empecemos</p>
          <h1 className="text-2xl font-bold tracking-tight">Crew Hub hace las cuentas por ti</h1>
          <p className="text-sm text-muted-foreground">Paso {step} de 3</p>
        </header>

        {step === 1 && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4" /> ¿Cómo se llama tu negocio?
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Nombre del negocio *</Label>
                <Input
                  id="company"
                  className="h-11"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Services"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tz">Tu horario local</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="tz" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="h-11 w-full text-base font-semibold"
                disabled={createCompany.isPending}
                onClick={submitCompany}
              >
                {createCompany.isPending ? "Preparando…" : "Continuar"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4" /> ¿Qué tipo de trabajos haces?
              </div>
              <p className="text-xs text-muted-foreground">
                Elige o escribe los que usas. Ejemplos: {BUSINESS_AREA_EXAMPLES.join(", ")}. Puedes omitir este paso.
              </p>
              <div className="flex gap-2">
                <Input
                  className="h-11"
                  value={areaDraft}
                  placeholder="Ej. Pintura"
                  onChange={(e) => setAreaDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArea();
                    }
                  }}
                />
                <Button type="button" variant="outline" className="h-11" onClick={addArea} aria-label="Agregar área">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {areas.length > 0 && (
                <ul className="space-y-2">
                  {areas.map((area) => (
                    <li key={area} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="truncate">{area}</span>
                      <button
                        type="button"
                        aria-label={`Quitar tipo de trabajo ${area}`}
                        onClick={() => setAreas(areas.filter((a) => a !== area))}
                        className="text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 flex-1" onClick={() => setStep(3)}>
                  Omitir
                </Button>
                <Button className="h-11 flex-1" disabled={createAreas.isPending} onClick={saveAreas}>
                  {createAreas.isPending ? "Guardando…" : "Continuar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardContent className="space-y-4 p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Crea tu primer trabajo</h2>
                <p className="text-sm text-muted-foreground">
                  Agrega lo básico ahora. Los demás detalles pueden esperar.
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  className="h-11 w-full text-base font-semibold"
                  onClick={() => navigate("/projects?new=1", { replace: true })}
                >
                  Crear mi primer trabajo
                </Button>
                <Button variant="outline" className="h-11 w-full" onClick={() => navigate("/", { replace: true })}>
                  Ir a Inicio
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
