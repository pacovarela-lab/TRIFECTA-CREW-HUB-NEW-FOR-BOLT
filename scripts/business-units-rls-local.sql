\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_eq(label text, actual bigint, expected bigint) returns void
language plpgsql as $$ begin
  if actual is distinct from expected then raise exception '%: expected %, got %', label, expected, actual; end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.assert_forbidden(label text, statement text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception
    when insufficient_privilege or foreign_key_violation or check_violation or unique_violation then
      raise notice 'PASS %', label;
      return;
  end;
  raise exception '%: operation unexpectedly succeeded', label;
end $$;

select pg_temp.assert_eq(
  'Trifecta has exactly four seeded business units',
  count(*),
  4
) from public.business_units bu
join public.companies c on c.id = bu.company_id
where lower(btrim(c.name)) = lower('Trifecta Home Improvement');

select pg_temp.assert_eq(
  'Prospect tenants receive no Trifecta defaults',
  count(*),
  0
) from public.business_units bu
join public.companies c on c.id = bu.company_id
where c.slug in ('prospect-beta-1', 'prospect-beta-2');

insert into public.companies(id, name, slug) values
  ('91000000-0000-0000-0000-000000000001', 'Business Unit RLS A', 'business-unit-rls-a'),
  ('91000000-0000-0000-0000-000000000002', 'Business Unit RLS B', 'business-unit-rls-b');
insert into public.divisions(id, company_id, name, slug) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'RLS', 'rls-a'),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'RLS', 'rls-b');
insert into auth.users(id, email) values
  ('93000000-0000-0000-0000-000000000001', 'business-admin-a@example.invalid'),
  ('93000000-0000-0000-0000-000000000002', 'business-manager-a@example.invalid'),
  ('93000000-0000-0000-0000-000000000003', 'business-member-a@example.invalid'),
  ('93000000-0000-0000-0000-000000000004', 'business-admin-b@example.invalid'),
  ('93000000-0000-0000-0000-000000000005', 'business-prospect-1@example.invalid'),
  ('93000000-0000-0000-0000-000000000006', 'business-prospect-2@example.invalid');
insert into public.user_roles(user_id, company_id, role) values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'admin'),
  ('93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'manager'),
  ('93000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'member'),
  ('93000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000002', 'admin');
insert into public.user_roles(user_id, company_id, role)
select '93000000-0000-0000-0000-000000000005', id, 'admin'::public.app_role
from public.companies where slug = 'prospect-beta-1';
insert into public.user_roles(user_id, company_id, role)
select '93000000-0000-0000-0000-000000000006', id, 'admin'::public.app_role
from public.companies where slug = 'prospect-beta-2';
insert into public.business_units(id, company_id, name, slug) values
  ('94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Area A', 'area-a'),
  ('94000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'Area B', 'area-b');

set local role authenticated;
set local request.jwt.claims='{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated"}';
select pg_temp.assert_eq('Admin reads own tenant area', count(*), 1)
from public.business_units where company_id = '91000000-0000-0000-0000-000000000001';
select pg_temp.assert_eq('Admin cannot read another tenant area', count(*), 0)
from public.business_units where company_id = '91000000-0000-0000-0000-000000000002';
with changed as (
  update public.business_units set name = 'Blocked update'
  where id = '94000000-0000-0000-0000-000000000002'
  returning 1
)
select pg_temp.assert_eq('Admin cannot modify another tenant area', count(*), 0) from changed;
select pg_temp.assert_forbidden('Admin cannot create an area for another tenant', $sql$
  insert into public.business_units(company_id, name, slug)
  values ('91000000-0000-0000-0000-000000000002', 'Blocked', 'blocked')
$sql$);
select pg_temp.assert_forbidden('Normalized duplicate names are rejected', $sql$
  insert into public.business_units(company_id, name, slug)
  values ('91000000-0000-0000-0000-000000000001', ' area A ', 'area-a-copy')
$sql$);
select pg_temp.assert_forbidden('Project rejects a cross-tenant business unit', $sql$
  insert into public.projects(company_id, division_id, business_unit_id, name)
  values (
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000002',
    'Blocked project'
  )
$sql$);

set local request.jwt.claims='{"sub":"93000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.business_units(company_id, name, slug)
values ('91000000-0000-0000-0000-000000000001', 'Manager Area', 'manager-area');
select pg_temp.assert_eq('Manager can create an own-tenant area', count(*), 1)
from public.business_units where slug = 'manager-area';

set local request.jwt.claims='{"sub":"93000000-0000-0000-0000-000000000003","role":"authenticated"}';
select pg_temp.assert_forbidden('Member cannot create an area', $sql$
  insert into public.business_units(company_id, name, slug)
  values ('91000000-0000-0000-0000-000000000001', 'Member Area', 'member-area')
$sql$);

set local request.jwt.claims='{"sub":"93000000-0000-0000-0000-000000000005","role":"authenticated"}';
select pg_temp.assert_eq('Prospect Beta 1 cannot see Trifecta areas', count(*), 0)
from public.business_units bu join public.companies c on c.id = bu.company_id
where lower(btrim(c.name)) = lower('Trifecta Home Improvement');

set local request.jwt.claims='{"sub":"93000000-0000-0000-0000-000000000006","role":"authenticated"}';
select pg_temp.assert_eq('Prospect Beta 2 cannot see Trifecta areas', count(*), 0)
from public.business_units bu join public.companies c on c.id = bu.company_id
where lower(btrim(c.name)) = lower('Trifecta Home Improvement');

reset role;
rollback;
