create or replace function public.expense_review_queue(p_project_id uuid default null)
returns table (
  expense_id uuid,
  issues text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with flagged as (
    select
      e.id as expense_id,
      array_remove(array[
        case
          when e.spent_on is not null and e.spent_on > current_date
          then 'future_date'
        end,
        case
          when not coalesce(e.is_overhead, false)
           and (
             coalesce(c.name, '') ~* 'labor'
             or coalesce(e.description, '') ~* '^\s*labor[:\s-]'
           )
           and e.worker_id is null
           and not (
             btrim(coalesce(v.name, '')) <> ''
             or coalesce(e.description, '') ~* 'labor\s*[:\-]\s*([^—\-|·,\n]+)'
             or coalesce(e.description, '') ~* 'zelle payment to\s+([^";\n]+)'
           )
          then case
            when coalesce(e.description, '') ~* 'labor\s*[:\-]\s*([^—\-|·,\n]+)'
            then 'unknown_labor'
            else 'labor_no_worker'
          end
        end,
        case
          when coalesce(e.description, '') ~* '\[PENDIENTE'
          then 'pending_evidence'
        end,
        case
          when e.project_id is null and not coalesce(e.is_overhead, false)
          then 'unassigned'
        end,
        case
          when e.category_id is null and btrim(coalesce(c.name, '')) = ''
          then 'no_category'
        end
      ], null)::text[] as issues
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.vendors v on v.id = e.vendor_id
    where p_project_id is null or e.project_id = p_project_id
  )
  select expense_id, issues
  from flagged
  where cardinality(issues) > 0
  order by expense_id;
$$;

grant execute on function public.expense_review_queue(uuid) to authenticated;
