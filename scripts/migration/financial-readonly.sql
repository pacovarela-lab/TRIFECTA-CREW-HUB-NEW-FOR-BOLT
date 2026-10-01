-- Source and target: run under the same final write freeze/snapshot policy.
-- Exact numeric text, never binary floating-point or rounded approximations.
-- Execute only after verifying the live schema against catalog-readonly.sql.
-- Preserve null/unassigned company/project groups; never drop discrepancies.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT company_id, project_id, count(*)::text AS rows,
       coalesce(sum(amount::numeric), 0)::text AS amount
FROM public.expenses GROUP BY company_id, project_id ORDER BY company_id, project_id;
SELECT company_id, project_id, count(*)::text AS rows,
       coalesce(sum(amount::numeric), 0)::text AS amount
FROM public.payments GROUP BY company_id, project_id ORDER BY company_id, project_id;
SELECT company_id, project_id, count(*)::text AS rows,
       count(checked_out_at)::text AS checked_out_rows
FROM public.worker_checkins GROUP BY company_id, project_id ORDER BY company_id, project_id;
SELECT company_id, project_id, direction, source_type, count(*)::text AS rows,
       count(*) FILTER (WHERE amount IS NULL)::text AS unknown_amount_rows,
       coalesce(sum(amount::numeric), 0)::text AS amount
FROM public.project_financial_ledger
GROUP BY company_id, project_id, direction, source_type
ORDER BY company_id, project_id, direction, source_type;
COMMIT;
-- These aggregates are necessary but insufficient. Also compare canonical
-- row hashes/keys (including worker_checkins timestamps), all financial source
-- tables, splits and V10 controls. Never change records to force a match.
