/*
# Project Financial Control: budget revisions + AI recommendations

1. New Tables

- `project_budget_revisions`
  Stores the "presupuesto revisado" per project, broken down by area
  (materials, labor, other, collections). The original budget is NEVER
  modified — it always lives in `projects.estimated_total` and the
  `estimate_items` table. This table holds the revised plan that can be
  updated when the user accepts an AI recommendation.
  - `id` (uuid PK)
  - `project_id` (uuid FK -> projects, ON DELETE CASCADE)
  - `company_id` (uuid FK -> companies)
  - `revised_materials` (numeric, default 0)
  - `revised_labor` (numeric, default 0)
  - `revised_other` (numeric, default 0)
  - `revised_collections` (numeric, default 0) — revised expected total to collect
  - `revision_reason` (text, nullable) — why it was revised
  - `created_by` (uuid, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

- `project_ai_recommendations`
  AI-generated recommendations when a project shows orange or red
  financial health. Each recommendation proposes an action and can be
  accepted or rejected by the user.
  - `id` (uuid PK)
  - `project_id` (uuid FK -> projects, ON DELETE CASCADE)
  - `company_id` (uuid FK -> companies)
  - `area` (text) — which area: materials, labor, other, collections, margin
  - `severity` (text) — orange or red
  - `explanation` (text) — what changed
  - `problem_area` (text) — the problematic area in plain language
  - `margin_impact` (numeric) — how much it affects the margin
  - `recommended_actions` (jsonb) — array of up to 3 action objects
  - `status` (text, default 'pending') — pending, accepted, rejected
  - `accepted_action_index` (integer, nullable) — which action was accepted (0-2)
  - `accepted_at` (timestamptz, nullable)
  - `rejected_at` (timestamptz, nullable)
  - `created_at` (timestamptz, default now())

2. Security
  - Enable RLS on both tables.
  - Company-scoped CRUD via current_company_id() function.

3. Important Notes
  - The original budget is NEVER stored in these tables — it always
    comes from `projects.estimated_total` + `estimate_items`.
  - Real data (expenses, payments) is never modified by recommendations.
  - Only the revised budget can be updated when a recommendation is accepted.
*/

CREATE TABLE IF NOT EXISTS project_budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  revised_materials numeric NOT NULL DEFAULT 0,
  revised_labor numeric NOT NULL DEFAULT 0,
  revised_other numeric NOT NULL DEFAULT 0,
  revised_collections numeric NOT NULL DEFAULT 0,
  revision_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_revisions_project ON project_budget_revisions(project_id);

ALTER TABLE project_budget_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_budget_revisions" ON project_budget_revisions;
CREATE POLICY "select_own_budget_revisions" ON project_budget_revisions FOR SELECT
  TO authenticated USING (company_id = current_company_id());

DROP POLICY IF EXISTS "insert_own_budget_revisions" ON project_budget_revisions;
CREATE POLICY "insert_own_budget_revisions" ON project_budget_revisions FOR INSERT
  TO authenticated WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS "update_own_budget_revisions" ON project_budget_revisions;
CREATE POLICY "update_own_budget_revisions" ON project_budget_revisions FOR UPDATE
  TO authenticated USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS "delete_own_budget_revisions" ON project_budget_revisions;
CREATE POLICY "delete_own_budget_revisions" ON project_budget_revisions FOR DELETE
  TO authenticated USING (company_id = current_company_id());

CREATE TABLE IF NOT EXISTS project_ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  area text NOT NULL,
  severity text NOT NULL DEFAULT 'orange',
  explanation text NOT NULL,
  problem_area text NOT NULL,
  margin_impact numeric NOT NULL DEFAULT 0,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  accepted_action_index integer,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_recs_project ON project_ai_recommendations(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_recs_status ON project_ai_recommendations(status);

ALTER TABLE project_ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_recs" ON project_ai_recommendations;
CREATE POLICY "select_own_ai_recs" ON project_ai_recommendations FOR SELECT
  TO authenticated USING (company_id = current_company_id());

DROP POLICY IF EXISTS "insert_own_ai_recs" ON project_ai_recommendations;
CREATE POLICY "insert_own_ai_recs" ON project_ai_recommendations FOR INSERT
  TO authenticated WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS "update_own_ai_recs" ON project_ai_recommendations;
CREATE POLICY "update_own_ai_recs" ON project_ai_recommendations FOR UPDATE
  TO authenticated USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS "delete_own_ai_recs" ON project_ai_recommendations;
CREATE POLICY "delete_own_ai_recs" ON project_ai_recommendations FOR DELETE
  TO authenticated USING (company_id = current_company_id());
