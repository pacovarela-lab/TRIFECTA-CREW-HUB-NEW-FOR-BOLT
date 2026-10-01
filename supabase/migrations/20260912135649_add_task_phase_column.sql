/*
# Add task_phase column to tasks table

1. Changes
- Adds a nullable `task_phase` text column to the `tasks` table.
- This column stores the work phase/stage associated with a task
  (e.g. "demolition", "plumbing", "electrical", "structure_drywall",
  "finishes_paint", "inspection_permits").
- Nullable so existing tasks are not affected; new tasks can optionally
  assign a phase.
- No enum constraint is created — the column is plain text so the
  application controls the allowed values via constants in enums.ts.
  This keeps the schema flexible if phases change in the future.

2. Security
- No RLS changes — the tasks table already has RLS enabled and policies
  from existing migrations. This column inherits the same policies.
*/

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_phase text;
