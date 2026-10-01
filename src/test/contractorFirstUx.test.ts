import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUSINESS_AREA_EXAMPLES } from "@/lib/onboarding";
import { PLATFORM_NAME, tenantIdentity } from "@/lib/tenant";

const source = (path: string) => readFileSync(path, "utf8");

describe("contractor-first UX", () => {
  it("explains the product in Spanish before login and signup", () => {
    for (const page of ["src/pages/Login.tsx", "src/pages/Signup.tsx"]) {
      const text = source(page);
      expect(text).toContain("Deja de adivinar si un trabajo te dejó dinero");
      expect(text).toContain("Trabajos · Gastos · Cobros · Ayudantes · Ganancia");
    }
  });

  it("keeps external branding on Crew Hub", () => {
    expect(PLATFORM_NAME).toBe("Crew Hub");
    expect(tenantIdentity("Prospect Beta 1")).toEqual({
      primary: "Prospect Beta 1",
      secondary: "Crew Hub",
    });
    expect(source("src/pages/Login.tsx")).not.toContain("Trifecta OS");
    expect(source("src/pages/Signup.tsx")).not.toContain("Trifecta Crew Hub");
  });

  it("presents onboarding as three human decisions without asking for a division", () => {
    const onboarding = source("src/pages/Onboarding.tsx");
    expect(onboarding).toContain("¿Cómo se llama tu negocio?");
    expect(onboarding).toContain("¿Qué tipo de trabajos haces?");
    expect(onboarding).toContain("Crea tu primer trabajo");
    expect(onboarding).toContain("Paso {step} de 3");
    expect(onboarding).not.toContain("división inicial General");
    expect(BUSINESS_AREA_EXAMPLES).toEqual(["Pintura", "Plomería", "Electricidad", "Handyman", "Roofing", "Otro"]);
  });

  it("automatically hides the division decision for a first job", () => {
    const dialog = source("src/components/projects/ProjectCreateDialog.tsx");
    expect(dialog).toContain("(divisions?.length ?? 0) > 1");
    expect(dialog).toContain("preselectDivisionId(divisions)");
    expect(dialog).toContain("¿Cuánto vas a cobrar? (opcional)");
    expect(dialog).toContain("Tipo de trabajo");
  });

  it("shows the five plain-language home metrics", () => {
    const dashboard = source("src/pages/Dashboard.tsx");
    for (const label of ["Trabajos activos", "Cobraste", "Gastaste", "Te deben", "Te quedó"]) {
      expect(dashboard).toContain(`label="${label}"`);
    }
    expect(dashboard).not.toContain('label="Profit"');
    expect(dashboard).not.toContain("Operational control center");
  });

  it("keeps capture central on mobile", () => {
    const layout = source("src/components/layout/AppLayout.tsx");
    expect(layout).toContain("Capturar");
    expect(layout).toContain("Tomar foto de recibo");
    expect(layout).toContain("Agregar gasto");
    expect(layout).toContain("Registrar pago");
  });

  it("uses the authorized existing project profitability values", () => {
    const detail = source("src/pages/ProjectDetail.tsx");
    expect(detail).toContain("const spent = fin?.spent ?? 0");
    expect(detail).toContain("const collected = fin?.collected ?? 0");
    expect(detail).toContain("const profit = fin?.profit ?? 0");
    expect(detail).toContain("La mano de obra ya está incluida en los gastos");
  });

  it("uses simple empty states", () => {
    expect(source("src/pages/Projects.tsx")).toContain("Crea tu primer trabajo.");
    expect(source("src/pages/Expenses.tsx")).toContain("Todavía no tienes gastos");
    expect(source("src/pages/Payments.tsx")).toContain("Cuando te paguen, registra el cobro aquí.");
    expect(source("src/pages/Tasks.tsx")).toContain("Agrega algo que no quieres olvidar.");
  });
});
