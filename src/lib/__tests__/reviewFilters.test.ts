import { describe, expect, it } from "vitest";
import { getPaymentIssueKinds, formatPaymentIssueKind } from "@/lib/paymentStatus";
import { expenseEditStartsUnassigned, getExpenseIssueKinds, getExpenseReviewSaveAction } from "@/lib/expenseReview";

const TODAY = "2026-09-07";

describe("payment review filter", () => {
  it("flags a payment with no client and no project", () => {
    expect(getPaymentIssueKinds({ received_on: TODAY }, TODAY)).toEqual(["no_client", "no_project"]);
  });

  it("keeps a payment pending when only the client was filled in", () => {
    expect(getPaymentIssueKinds({ clients: { name: "Ana" }, received_on: TODAY }, TODAY)).toEqual(["no_project"]);
  });

  it("keeps a payment pending when only the project was filled in", () => {
    expect(getPaymentIssueKinds({ projects: { name: "Baño 2" }, received_on: TODAY }, TODAY)).toEqual(["no_client"]);
  });

  it("clears a payment with client and project", () => {
    expect(getPaymentIssueKinds({ client_id: "c", project_id: "p", received_on: TODAY }, TODAY)).toEqual([]);
  });

  it("flags a future date", () => {
    expect(getPaymentIssueKinds({ client_id: "c", project_id: "p", received_on: "2026-12-01" }, TODAY)).toEqual(["future_date"]);
  });

  it("labels issues in Spanish", () => {
    expect(formatPaymentIssueKind("no_client")).toBe("Sin cliente");
    expect(formatPaymentIssueKind("no_project")).toBe("Sin proyecto");
    expect(formatPaymentIssueKind("future_date")).toBe("Fecha futura");
  });
});

describe("expense review filter", () => {
  it("keeps prorated general expenses out of the pending list", () => {
    expect(getExpenseIssueKinds({ is_overhead: true, category_id: "c", spent_on: TODAY }, TODAY)).toEqual([]);
  });

  it("keeps an expense pending when the category is still missing", () => {
    expect(getExpenseIssueKinds({ is_overhead: true, spent_on: TODAY }, TODAY)).toEqual(["no_category"]);
  });

  it("flags an expense with no project", () => {
    expect(getExpenseIssueKinds({ category_id: "c", spent_on: TODAY }, TODAY)).toContain("unassigned");
  });

  it("stays pending when only part of the missing information was fixed", () => {
    const fixed = { category_id: "c", vendor_id: "v", spent_on: TODAY };
    expect(getExpenseIssueKinds(fixed, TODAY)).toEqual(["unassigned"]);
  });

  it("opens a normal project-less expense with Project assignment visible", () => {
    expect(expenseEditStartsUnassigned({ project_id: null, is_overhead: false })).toBe(false);
  });

  it("keeps intentional overhead in unassigned edit mode", () => {
    expect(expenseEditStartsUnassigned({ project_id: null, is_overhead: true })).toBe(true);
  });

  it("keeps the editor open when a saved expense still has review issues", () => {
    const result = getExpenseReviewSaveAction(
      { project_id: "p", category_id: "c", spent_on: TODAY, description: "[PENDIENTE EVIDENCIA] receipt" },
      true,
      TODAY,
    );
    expect(result.action).toBe("stay_open");
    expect(result.issues).toEqual(["pending_evidence"]);
  });

  it("prompts learning only after the expense is fully resolved", () => {
    const result = getExpenseReviewSaveAction(
      { project_id: "p", category_id: "c", worker_id: "w", spent_on: TODAY },
      true,
      TODAY,
    );
    expect(result).toEqual({ issues: [], action: "prompt_learning" });
  });

  it("closes only after the expense is fully resolved when there is no learning prompt", () => {
    const result = getExpenseReviewSaveAction(
      { project_id: "p", category_id: "c", worker_id: "w", spent_on: TODAY },
      false,
      TODAY,
    );
    expect(result).toEqual({ issues: [], action: "close" });
  });
});
