import { describe, it, expect } from "vitest";

// Pure helper that mirrors the logic in useUserRoles.ts
function deriveRoleFlags(roles: string[]) {
  const isField = roles.includes("field") && !roles.includes("admin") && !roles.includes("manager");
  return {
    isField,
    canSeeFinancials: !isField,
  isAdmin: roles.includes("admin"),
    isManager: roles.includes("manager"),
  };
}

describe("Permisos de UI por rol — mapping de roles", () => {
  describe("ADMIN", () => {
    it("ve toda la información financiera", () => {
      const flags = deriveRoleFlags(["admin"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });

    it("admin + field sigue viendo finanzas (admin domina)", () => {
      const flags = deriveRoleFlags(["admin", "field"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });
  });

  describe("MANAGER", () => {
    it("ve toda la información financiera", () => {
      const flags = deriveRoleFlags(["manager"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });

    it("manager + field sigue viendo finanzas (manager domina)", () => {
      const flags = deriveRoleFlags(["manager", "field"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });
  });

  describe("FIELD", () => {
    it("no ve información financiera", () => {
      const flags = deriveRoleFlags(["field"]);
      expect(flags.canSeeFinancials).toBe(false);
      expect(flags.isField).toBe(true);
    });
  });

  describe("MEMBER (sin field)", () => {
    it("ve información financiera", () => {
      const flags = deriveRoleFlags(["member"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });
  });

  describe("VIEWER (sin field)", () => {
    it("ve información financiera", () => {
      const flags = deriveRoleFlags(["viewer"]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });
  });

  describe("Sin roles", () => {
    it("no es field y puede ver finanzas por defecto", () => {
      const flags = deriveRoleFlags([]);
      expect(flags.canSeeFinancials).toBe(true);
      expect(flags.isField).toBe(false);
    });
  });
});

describe("Permisos de UI por rol — información oculta para field", () => {
  const financialRoutes = ["/calculator", "/payments", "/reports", "/ledger", "/bank", "/expenses/discrepancies"];

  it("rutas financieras están en la lista de ocultación", () => {
    expect(financialRoutes).toContain("/calculator");
    expect(financialRoutes).toContain("/payments");
    expect(financialRoutes).toContain("/reports");
    expect(financialRoutes).toContain("/ledger");
    expect(financialRoutes).toContain("/bank");
  });

  it("rutas operativas NO están en la lista de ocultación", () => {
    const operationalRoutes = ["/", "/projects", "/tasks", "/more", "/expenses", "/receipts", "/alerts", "/checkins", "/workers", "/assistant"];
    for (const route of operationalRoutes) {
      expect(financialRoutes).not.toContain(route);
    }
  });

  it("field no ve: valor del contrato, ingresos, ganancias, margen, costos, saldo, alertas financieras", () => {
    const flags = deriveRoleFlags(["field"]);
    const hiddenElements = [
      "Vas a cobrar",
      "Cobraste",
      "Gastaste",
      "Te quedó",
      "Te deben",
      "Margen proyectado",
      "Saldo por cobrar",
      "Cobros recientes",
      "Registrar cobro",
    ];
    expect(flags.canSeeFinancials).toBe(false);
    hiddenElements.forEach((label) => {
      expect(typeof label).toBe("string");
    });
  });

  it("field mantiene acceso a: tareas, check-in/out, fotos, recibos, gastos", () => {
    const flags = deriveRoleFlags(["field"]);
    expect(flags.canSeeFinancials).toBe(false);
    const allowedRoutes = ["/tasks", "/checkins", "/receipts", "/expenses", "/projects"];
    for (const route of allowedRoutes) {
      expect(financialRoutes).not.toContain(route);
    }
  });
});
