import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isDashboardTenantEmpty } from "@/lib/dashboardFilters";
import { countReceiptInboxRows } from "@/lib/receiptInbox";

const source = (path: string) => readFileSync(path, "utf8");

describe("pre-beta hardening regressions", () => {
  it("wraps /import in the established internal guard and hides its external navigation item", () => {
    const app = source("src/App.tsx");
    const layout = source("src/components/layout/AppLayout.tsx");
    expect(app).toContain('<Route path="/import" element={<InternalToolGuard><ImportEstimate /></InternalToolGuard>} />');
    expect(layout).toContain("isInternalTrifectaTenant(company?.id)");
    expect(layout).toContain('{ to: "/import", label: "Importar", icon: Upload }');
    const sharedNav = layout.slice(layout.indexOf("const sharedNavItems"), layout.indexOf("const mobileNavItems"));
    expect(sharedNav).not.toContain('to: "/import"');
  });

  it("counts an empty visible receipt set as zero and counts returned receipts exactly", () => {
    expect(countReceiptInboxRows(null)).toBe(0);
    expect(countReceiptInboxRows([])).toBe(0);
    expect(countReceiptInboxRows([{ id: "one" }, { id: "two" }])).toBe(2);
    const hooks = source("src/hooks/useTrifectaData.ts");
    const hook = hooks.slice(hooks.indexOf("export const useReceiptsInboxCount"));
    expect(hook).toMatch(/\.from\("receipts"\)\s*\.select\("id"\)/);
    expect(hook).not.toContain('head: true');
  });

  it("keeps the dashboard selector reachable for an empty selected Business Area", () => {
    const zeroes = { projectCount: 0, spent: 0, collected: 0 };
    expect(isDashboardTenantEmpty({ businessUnitId: "__all", ...zeroes })).toBe(true);
    expect(isDashboardTenantEmpty({ businessUnitId: "area-1", ...zeroes })).toBe(false);
    expect(isDashboardTenantEmpty({ businessUnitId: "__all", projectCount: 1, spent: 0, collected: 0 })).toBe(false);
  });

  it("loads only Latin Inter subsets and keeps the existing local font dependencies", () => {
    const main = source("src/main.tsx");
    expect(main).toContain('@fontsource/inter/latin-400.css');
    expect(main).toContain('@fontsource-variable/jetbrains-mono/wght.css');
    expect(main).not.toContain('@fontsource/inter/400.css');
  });
});
