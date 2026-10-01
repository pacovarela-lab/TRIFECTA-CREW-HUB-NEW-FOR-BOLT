import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const review = readFileSync(
  join(process.cwd(), "src", "components", "estimates", "EstimatePhotoReview.tsx"),
  "utf8",
);
const approval = readFileSync(
  join(process.cwd(), "src", "components", "estimates", "EstimatePhotoApproval.tsx"),
  "utf8",
);

describe("P0: approved estimate review load", () => {
  it("initializes questions only for reviewable statuses", () => {
    expect(review).toContain('nextEstimate.status === "needs_answers" || nextEstimate.status === "reviewed"');
    expect(review.match(/initialize_estimate_review_questions/g)?.length).toBe(1);
  });

  it("loads existing questions read-only for approved and draft revisions", () => {
    expect(review).toContain('from("estimate_questions")');
    const readOnly = review.slice(review.indexOf("} else {"), review.indexOf("setEstimate({"));
    expect(readOnly).toContain(".select(");
    expect(readOnly).not.toContain(".insert(");
    expect(readOnly).not.toContain(".update(");
    expect(readOnly).not.toContain(".rpc(");
  });

  it("guides the user to re-analyze a freshly created revision instead of failing", () => {
    expect(review).toContain('const pendingAnalysis = estimate.status === "draft"');
    expect(review).toContain('estimate.status === "approved" || pendingAnalysis');
    expect(review).toContain("Nueva revisión creada.");
  });

  it("still renders the approval section for reviewed and approved estimates", () => {
    expect(review).toContain('estimate.status === "reviewed" || estimate.status === "approved"');
  });

  it("shows client preview once approved", () => {
    expect(approval).toContain('const approved = estimate.status === "approved"');
    expect(approval).toContain("{approved && preview &&");
    expect(approval).toContain("Client Estimate Preview");
  });

  it("offers Create Work only while no project exists, and never twice", () => {
    expect(approval).toContain("{!estimate.project_id && <Card>");
    expect(approval).toContain("{estimate.project_id && <p");
    expect(approval).toContain("Trabajo creado. Los costos reales permanecen separados.");
  });

  it("keeps client preview free of internal cost fields", () => {
    const previewBlock = approval.slice(
      approval.indexOf("Client Estimate Preview"),
      approval.indexOf("{!estimate.project_id"),
    );
    expect(previewBlock).not.toContain("planned_cost");
    expect(previewBlock).not.toContain("internal_notes");
    expect(previewBlock).not.toContain("margin");
  });
});
