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
  exception when insufficient_privilege then
    raise notice 'PASS %', label;
    return;
  end;
  raise exception '%: operation unexpectedly succeeded', label;
end $$;

insert into auth.users(id,email) values
 ('a0000000-0000-0000-0000-000000000001','rls-trifecta@example.invalid'),
 ('a0000000-0000-0000-0000-000000000002','rls-beta1@example.invalid'),
 ('a0000000-0000-0000-0000-000000000003','rls-beta2@example.invalid'),
 ('a0000000-0000-0000-0000-000000000004','rls-none@example.invalid');

insert into public.companies(id,name,slug) values
 ('b0000000-0000-0000-0000-000000000001','RLS Trifecta','rls-trifecta')
on conflict (id) do nothing;
update public.companies set id='b0000000-0000-0000-0000-000000000002' where slug='prospect-beta-1';
update public.companies set id='b0000000-0000-0000-0000-000000000003' where slug='prospect-beta-2';

insert into public.user_roles(user_id,company_id,role) values
 ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','admin'),
 ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','member'),
 ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','admin');
insert into public.divisions(id,company_id,name,slug) values
 ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','RLS','rls-1'),
 ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','RLS','rls-2'),
 ('c0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','RLS','rls-3');
insert into public.projects(id,company_id,division_id,name) values
 ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','RLS Project'),
 ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','RLS Project'),
 ('d0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','RLS Project');
insert into public.tasks(id,company_id,division_id,project_id,title) values
 ('e0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','RLS Task'),
 ('e0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','RLS Task'),
 ('e0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003','RLS Task');
insert into public.product_feedback(company_id,user_id,comments) values
 ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','RLS'),
 ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','RLS');
insert into public.notification_outbox(company_id,type,idempotency_key) values
 ('b0000000-0000-0000-0000-000000000001','TASK_ASSIGNED_SMS','rls-outbox-1'),
 ('b0000000-0000-0000-0000-000000000002','TASK_ASSIGNED_SMS','rls-outbox-2');
insert into public.user_calendar_connections(user_id,company_id) values
 ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
 ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002');
insert into public.integration_audit_logs(company_id,user_id,event_type,result) values
 ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','RLS','ok'),
 ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','RLS','ok');
insert into storage.buckets(id,name,public) values ('receipts','receipts',false) on conflict (id) do nothing;
insert into storage.objects(bucket_id,name,owner) values
 ('receipts','b0000000-0000-0000-0000-000000000001/rls.jpg','a0000000-0000-0000-0000-000000000001'),
 ('receipts','b0000000-0000-0000-0000-000000000002/rls.jpg','a0000000-0000-0000-0000-000000000002');

-- Transaction-only grants isolate policy behavior from environment-managed PostgREST grants.
grant select on public.companies,public.projects,public.tasks,public.product_feedback,public.notification_outbox,
  public.user_calendar_connections,public.integration_audit_logs,storage.objects to authenticated;
grant update on public.tasks,public.companies to authenticated;
grant insert on public.product_feedback to authenticated;

set local role authenticated;
set local request.jwt.claims='{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select pg_temp.assert_eq('Trifecta cannot read Beta 1',count(*),0) from public.projects where company_id='b0000000-0000-0000-0000-000000000002';

set local request.jwt.claims='{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';
select pg_temp.assert_eq('Beta 1 cannot read Trifecta',count(*),0) from public.projects where company_id='b0000000-0000-0000-0000-000000000001';
select pg_temp.assert_eq('Beta 1 cannot read Beta 2',count(*),0) from public.projects where company_id='b0000000-0000-0000-0000-000000000003';
with changed as (update public.tasks set title='blocked' where id='e0000000-0000-0000-0000-000000000003' returning 1) select pg_temp.assert_eq('Beta 2 task cannot be updated by Beta 1',count(*),0) from changed;
select pg_temp.assert_eq('Known foreign UUID grants no access',count(*),0) from public.tasks where id='e0000000-0000-0000-0000-000000000003';
select pg_temp.assert_forbidden('Arbitrary company_id is rejected',$sql$insert into public.product_feedback(company_id,user_id,comments) values ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','blocked')$sql$);
with changed as (update public.companies set name='blocked' where id='b0000000-0000-0000-0000-000000000002' returning 1) select pg_temp.assert_eq('Member has no admin update',count(*),0) from changed;
select pg_temp.assert_eq('Storage is tenant isolated',count(*),1) from storage.objects where bucket_id='receipts';
select pg_temp.assert_eq('Feedback is tenant isolated',count(*),1) from public.product_feedback;
select pg_temp.assert_eq('Tasks are tenant isolated',count(*),1) from public.tasks;
select pg_temp.assert_eq('Member cannot read outbox',count(*),0) from public.notification_outbox;
select pg_temp.assert_eq('Calendar connections are own-tenant only',count(*),1) from public.user_calendar_connections;
select pg_temp.assert_eq('Member cannot read integration logs',count(*),0) from public.integration_audit_logs;

set local request.jwt.claims='{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
select pg_temp.assert_eq('User without membership gets no projects',count(*),0) from public.projects;
select pg_temp.assert_eq('User without membership gets no tasks',count(*),0) from public.tasks;

reset role;
rollback;
