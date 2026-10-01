import { describe, expect, it } from "vitest";
import { parseBofaCsv } from "@/lib/bankDetect";

const csv = [
  "Description,,Summary Amt.",
  'Beginning balance as of 07/22/2026,,"4,076.80"',
  "",
  "Date,Description,Amount,Running Bal.",
  '07/22/2026,Beginning balance as of 07/22/2026,,"4,076.80"',
  '07/22/2026,"Zelle payment from JEKI ABRAHAM Conf# uwor0ioeq","1,300.00","5,376.80"',
  '08/05/2026,"Zelle payment to ARNALDO for "Nick Menza, and Nick Julian 1 day"; Conf# icej07664","-900.00","6,599.12"',
  '08/20/2026,"Plastiq DES:PQ INFO:10044-000 final payment less 641","10,997.00","14,242.62"',
].join("\n");

describe("parseBofaCsv with unescaped quotes in description", () => {
  const parsed = parseBofaCsv(csv);

  it("keeps every real movement and drops the balance line", () => {
    expect(parsed.rows).toHaveLength(3);
  });

  it("reads signed amounts from the Amount column, not from the description", () => {
    const zelleOut = parsed.rows.find((r) => r.description.includes("ARNALDO"));
    expect(zelleOut?.amount).toBe(-900);
    expect(zelleOut?.running_balance).toBe(6599.12);
    expect(zelleOut?.description).toContain('"Nick Menza, and Nick Julian 1 day"');
  });

  it("keeps credits positive", () => {
    expect(parsed.rows.find((r) => r.description.includes("JEKI"))?.amount).toBe(1300);
    expect(parsed.rows.find((r) => r.description.includes("Plastiq"))?.amount).toBe(10997);
  });
});
