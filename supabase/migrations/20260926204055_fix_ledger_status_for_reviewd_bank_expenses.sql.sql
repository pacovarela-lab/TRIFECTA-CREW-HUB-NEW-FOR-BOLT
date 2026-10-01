-- Fix: expenses linked to bank transactions that have already been categorized
-- (i.e. reviewed by a human) should count as "confirmed", not "needs_review".
-- Previously ANY expense with bank_transaction_id IS NOT NULL was marked needs_review,
-- which excluded $7,867.38 of already-reviewed expenses from project totals.
--
-- New status logic for expenses in the ledger:
--   reconciled   → reconciled_at IS NOT NULL
--   needs_review → bank_transaction_id IS NOT NULL AND category_id IS NULL (not yet reviewed)
--   confirmed    → everything else (including bank-linked expenses that have a category)

CREATE OR REPLACE VIEW public.project_financial_ledger AS
SELECT e.company_id,
    e.project_id,
    'expense'::text AS source_type,
    e.id AS source_id,
    e.id AS expense_id,
    e.spent_on AS date,
    e.amount::numeric AS amount,
    'expense'::text AS direction,
        CASE
            WHEN e.reconciled_at IS NOT NULL THEN 'reconciled'::text
            WHEN e.bank_transaction_id IS NOT NULL AND e.category_id IS NULL THEN 'needs_review'::text
            ELSE 'confirmed'::text
        END AS status,
    NULL::numeric AS confidence_score,
    e.description,
    c.name AS category,
    v.name AS vendor,
    NULL::text AS client,
        CASE
            WHEN e.bank_transaction_id IS NOT NULL THEN 'Created from bank transaction'::text
            ELSE NULL::text
        END AS source_note,
    e.division_id,
    e.created_at
   FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     LEFT JOIN vendors v ON v.id = e.vendor_id
  WHERE e.is_overhead = false AND NOT (EXISTS ( SELECT 1
           FROM expense_project_splits s
          WHERE s.expense_id = e.id))
UNION ALL
 SELECT s.company_id,
    s.project_id,
    'expense_split'::text AS source_type,
    s.id AS source_id,
    e.id AS expense_id,
    e.spent_on AS date,
    s.amount,
    'expense'::text AS direction,
        CASE
            WHEN e.reconciled_at IS NOT NULL THEN 'reconciled'::text
            WHEN e.bank_transaction_id IS NOT NULL AND e.category_id IS NULL THEN 'needs_review'::text
            ELSE 'confirmed'::text
        END AS status,
    NULL::numeric AS confidence_score,
    e.description,
    c.name AS category,
    v.name AS vendor,
    NULL::text AS client,
    'Split of expense '::text || e.id::text AS source_note,
    e.division_id,
    s.created_at
   FROM expense_project_splits s
     JOIN expenses e ON e.id = s.expense_id
     LEFT JOIN categories c ON c.id = e.category_id
     LEFT JOIN vendors v ON v.id = e.vendor_id
  WHERE e.is_overhead = false
UNION ALL
 SELECT p.company_id,
    p.project_id,
    'payment'::text AS source_type,
    p.id AS source_id,
    NULL::uuid AS expense_id,
    p.received_on AS date,
    p.amount::numeric AS amount,
    'income'::text AS direction,
        CASE
            WHEN p.reconciled_at IS NOT NULL THEN 'reconciled'::text
            WHEN p.bank_transaction_id IS NOT NULL THEN 'needs_review'::text
            ELSE 'confirmed'::text
        END AS status,
    NULL::numeric AS confidence_score,
    p.notes AS description,
    NULL::text AS category,
    NULL::text AS vendor,
    cl.name AS client,
        CASE
            WHEN p.bank_transaction_id IS NOT NULL THEN 'Created from bank transaction'::text
            ELSE NULL::text
        END AS source_note,
    p.division_id,
    p.created_at
   FROM payments p
     LEFT JOIN clients cl ON cl.id = p.client_id;
