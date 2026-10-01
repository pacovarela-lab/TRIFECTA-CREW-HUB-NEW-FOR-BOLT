\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_eq(label text, actual bigint, expected bigint) returns void
language plpgsql as $$ begin
  if actual is distinct from expected then raise exception '%: expected %, got %', label, expected, actual; end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.assert_true(label text, actual boolean) returns void
language plpgsql as $$ begin
  if actual is not true then raise exception '%: expected true', label; end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.assert_forbidden(label text, statement text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception when others then
    raise notice 'PASS % (%)', label, sqlerrm;
    return;
  end;
  raise exception '%: operation unexpectedly succeeded', label;
end $$;

create or replace function pg_temp.assert_forbidden_with(label text, statement text, expected text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception when others then
    if position(lower(expected) in lower(sqlerrm)) = 0 then
      raise exception '%: expected error containing %, got %', label, expected, sqlerrm;
    end if;
    raise notice 'PASS % (%)', label, sqlerrm;
    return;
  end;
  raise exception '%: operation unexpectedly succeeded', label;
end $$;

insert into public.companies(id,name,slug,trial_status,trial_ends_at,trial_exempt) values
 ('a1000000-0000-4000-8000-000000000001','Estimate Active A','estimate-active-a','trial',now()+interval '10 days',false),
 ('a1000000-0000-4000-8000-000000000002','Estimate Active B','estimate-active-b','trial',now()+interval '10 days',false),
 ('a1000000-0000-4000-8000-000000000003','Estimate Expired','estimate-expired','trial',now()-interval '1 day',false),
 ('a1000000-0000-4000-8000-000000000004','Estimate Exempt','estimate-exempt','trial',now()-interval '1 day',true);

insert into auth.users(id,email) values
 ('a2000000-0000-4000-8000-000000000001','estimate-creator-a@example.invalid'),
 ('a2000000-0000-4000-8000-000000000002','estimate-manager-a@example.invalid'),
 ('a2000000-0000-4000-8000-000000000003','estimate-member-a@example.invalid'),
 ('a2000000-0000-4000-8000-000000000004','estimate-admin-b@example.invalid'),
 ('a2000000-0000-4000-8000-000000000005','estimate-expired@example.invalid'),
 ('a2000000-0000-4000-8000-000000000006','estimate-exempt@example.invalid'),
 ('a2000000-0000-4000-8000-000000000007','estimate-admin-a@example.invalid');

update public.profiles set company_id='a1000000-0000-4000-8000-000000000001' where id in (
 'a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003');
update public.profiles set company_id='a1000000-0000-4000-8000-000000000002' where id='a2000000-0000-4000-8000-000000000004';
update public.profiles set company_id='a1000000-0000-4000-8000-000000000003' where id='a2000000-0000-4000-8000-000000000005';
update public.profiles set company_id='a1000000-0000-4000-8000-000000000004' where id='a2000000-0000-4000-8000-000000000006';
update public.profiles set company_id='a1000000-0000-4000-8000-000000000001' where id='a2000000-0000-4000-8000-000000000007';

insert into public.user_roles(user_id,company_id,role) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','member'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','manager'),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','member'),
 ('a2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000002','admin'),
 ('a2000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000003','member'),
 ('a2000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','member'),
 ('a2000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000001','admin');

insert into public.divisions(id,company_id,name,slug) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','General','estimate-a'),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','General','estimate-b');
insert into public.clients(id,company_id,name) values
 ('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Client A'),
 ('a4000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','Client B');
insert into public.projects(id,company_id,division_id,name) values
 ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Project A'),
 ('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002','Project B');
insert into public.business_units(id,company_id,name,slug) values
 ('a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Area A','estimate-area-a'),
 ('a6000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','Area B','estimate-area-b');

-- Legacy compatibility remains explicit: total is copied to charge_amount and item total to client_price.
insert into public.estimates(id,company_id,division_id,project_id,source,total,imported_by)
values ('a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 'a3000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','handoff',1250,
 'a2000000-0000-4000-8000-000000000001');
insert into public.estimate_items(id,estimate_id,company_id,description,quantity,unit_price,total,position)
values ('a8000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001',
 'a1000000-0000-4000-8000-000000000001','Legacy line',2,625,1250,0);
select pg_temp.assert_true('Legacy estimate total retains client charge semantics', exists(
 select 1 from public.estimates where id='a7000000-0000-4000-8000-000000000001' and total=1250 and charge_amount=1250
));
select pg_temp.assert_true('Legacy item total is backfilled as client price', exists(
 select 1 from public.estimate_items where id='a8000000-0000-4000-8000-000000000001' and total=1250 and client_price=1250 and planned_cost is null
));

-- Real rows for Company B, admin approval, and expired-trial read/write tests.
insert into public.estimates(id,company_id,division_id,project_id,source,total,imported_by,title)
values
 ('a7000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000002','manual',800,
  'a2000000-0000-4000-8000-000000000004','Company B private estimate'),
 ('a7000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','manual',900,
  'a2000000-0000-4000-8000-000000000001','Admin approval estimate'),
 ('a7000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003',
  null,null,'manual',700,'a2000000-0000-4000-8000-000000000005','Expired tenant estimate');

insert into public.estimate_items(id,estimate_id,company_id,description,item_type,planned_cost,total)
values
 ('a8000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002','Company B item','material',200,300),
 ('a8000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000003','Expired item','labor',100,150);
insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
values
 ('a9000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
 'a7000000-0000-4000-8000-000000000002',
 'a1000000-0000-4000-8000-000000000002/a7000000-0000-4000-8000-000000000002/a9000000-0000-4000-8000-000000000002.jpg',
 1,repeat('2',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000004'),
 ('a9000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003',
 'a7000000-0000-4000-8000-000000000004',
 'a1000000-0000-4000-8000-000000000003/a7000000-0000-4000-8000-000000000004/a9000000-0000-4000-8000-000000000004.jpg',
 1,repeat('d',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000005');
insert into public.estimate_questions(id,company_id,estimate_id,ordinal,category,question)
values
 ('aa000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
 'a7000000-0000-4000-8000-000000000002',1,'scope','Company B question?'),
 ('aa000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003',
 'a7000000-0000-4000-8000-000000000004',1,'scope','Expired question?');
insert into public.estimate_learned_terms(id,company_id,user_id,observed_term,normalized_term,term_type)
values
 ('ab000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 'a2000000-0000-4000-8000-000000000001','DW','Drywall','abbreviation'),
 ('ab000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
 'a2000000-0000-4000-8000-000000000004','WR','Water resistant','abbreviation'),
 ('ab000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003',
 'a2000000-0000-4000-8000-000000000005','HD','Home Depot','abbreviation');
insert into public.estimate_analysis_runs(id,company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
values
 ('ac000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',
 'a7000000-0000-4000-8000-000000000002','request-1',repeat('b',64),'ingestion','pending','estimate-photo-v1',
 'a2000000-0000-4000-8000-000000000004'),
 ('ac000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003',
 'a7000000-0000-4000-8000-000000000004','expired-run',repeat('e',64),'ingestion','pending','estimate-photo-v1',
 'a2000000-0000-4000-8000-000000000005');

insert into storage.objects(id,bucket_id,name,owner,metadata)
values
 ('ad000000-0000-4000-8000-000000000002','estimate-images',
  'a1000000-0000-4000-8000-000000000002/a7000000-0000-4000-8000-000000000002/a9000000-0000-4000-8000-000000000002.jpg',
  'a2000000-0000-4000-8000-000000000004','{"mimetype":"image/jpeg"}'::jsonb),
 ('ad000000-0000-4000-8000-000000000003','estimate-images',
  'a1000000-0000-4000-8000-000000000003/a7000000-0000-4000-8000-000000000004/a9000000-0000-4000-8000-000000000004.jpg',
  'a2000000-0000-4000-8000-000000000005','{"mimetype":"image/jpeg"}'::jsonb);

set local role authenticated;
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.estimates(id,company_id,source_type,created_by,title,status,schema_version,charge_amount,client_id,business_unit_id)
values ('a7000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','photo_ai',
 'a2000000-0000-4000-8000-000000000001','Photo estimate','draft','estimate-photo-v1',5000,
 'a4000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001');
select pg_temp.assert_eq('Member creates and reads own-company estimate',count(*),1)
from public.estimates where id='a7000000-0000-4000-8000-000000000010';
select pg_temp.assert_eq('Cross-tenant estimate is invisible',count(*),0)
from public.estimates where company_id='a1000000-0000-4000-8000-000000000002';
with changed as (
 update public.estimates set title='Cross-tenant update' where id='a7000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant estimate update is blocked',count(*),0) from changed;
with removed as (
 delete from public.estimates where id='a7000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant estimate delete is blocked',count(*),0) from removed;
select pg_temp.assert_eq('Cross-tenant item SELECT is blocked',count(*),0)
from public.estimate_items where id='a8000000-0000-4000-8000-000000000002';
with changed as (
 update public.estimate_items set description='Blocked' where id='a8000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant item UPDATE is blocked',count(*),0) from changed;
with removed as (
 delete from public.estimate_items where id='a8000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant item DELETE is blocked',count(*),0) from removed;
select pg_temp.assert_eq('Cross-tenant image SELECT is blocked',count(*),0)
from public.estimate_images where id='a9000000-0000-4000-8000-000000000002';
with changed as (
 update public.estimate_images set byte_size=1001 where id='a9000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant image UPDATE is blocked',count(*),0) from changed;
with removed as (
 delete from public.estimate_images where id='a9000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant image DELETE is blocked',count(*),0) from removed;
select pg_temp.assert_eq('Cross-tenant question SELECT is blocked',count(*),0)
from public.estimate_questions where id='aa000000-0000-4000-8000-000000000002';
with changed as (
 update public.estimate_questions set question='Blocked?' where id='aa000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant question UPDATE is blocked',count(*),0) from changed;
with removed as (
 delete from public.estimate_questions where id='aa000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant question DELETE is blocked',count(*),0) from removed;
select pg_temp.assert_eq('Cross-tenant learned term SELECT is blocked',count(*),0)
from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000002';
select pg_temp.assert_forbidden('Direct learned term UPDATE is blocked by least privilege',$sql$
 update public.estimate_learned_terms set confirmations=2 where id='ab000000-0000-4000-8000-000000000002'
$sql$);
select pg_temp.assert_forbidden('Direct learned term DELETE is blocked by least privilege',$sql$
 delete from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000002'
$sql$);
select pg_temp.assert_forbidden('Cross-tenant learned term INSERT is blocked',$sql$
 insert into public.estimate_learned_terms(company_id,user_id,observed_term,normalized_term,term_type)
 values ('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000004','Blocked','Blocked','alias')
$sql$);
select pg_temp.assert_true('Authenticated learned terms privileges are SELECT only',
 has_table_privilege('authenticated','public.estimate_learned_terms','SELECT')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','INSERT')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','UPDATE')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','DELETE')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','TRUNCATE')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','REFERENCES')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','TRIGGER')
 and not has_table_privilege('authenticated','public.estimate_learned_terms','MAINTAIN'));
select pg_temp.assert_true('Authenticated has no direct learned event privileges',
 not has_table_privilege('authenticated','public.estimate_learned_term_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'));
select pg_temp.assert_true('Learned RPC EXECUTE grants are explicit and exclude anon/PUBLIC',
 has_function_privilege('authenticated','public.record_estimate_learned_terms(uuid,jsonb)','EXECUTE')
 and has_function_privilege('authenticated','public.set_estimate_learned_term_active(uuid,boolean)','EXECUTE')
 and not has_function_privilege('anon','public.record_estimate_learned_terms(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.set_estimate_learned_term_active(uuid,boolean)','EXECUTE')
 and not exists (
   select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid in ('public.record_estimate_learned_terms(uuid,jsonb)'::regprocedure,
                   'public.set_estimate_learned_term_active(uuid,boolean)'::regprocedure)
     and a.grantee=0 and a.privilege_type='EXECUTE'
 ));
select pg_temp.assert_forbidden('Authenticated TRUNCATE learned terms is denied',$sql$truncate public.estimate_learned_terms$sql$);
select pg_temp.assert_eq('Member reads own-tenant learned term',count(*),1)
from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000001';
select pg_temp.assert_eq('Member cannot read cross-tenant learned term',count(*),0)
from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000002';
select pg_temp.assert_forbidden_with('Member cannot administer learned term',$sql$
 select public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000001',false)
$sql$,'learned_term_forbidden');

set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_true('Manager administers same-tenant learned term',
 (public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000001',false)).is_active=false);
select pg_temp.assert_forbidden_with('Manager cannot administer cross-tenant learned term',$sql$
 select public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000002',false)
$sql$,'learned_term_forbidden');
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000007","role":"authenticated"}';
select pg_temp.assert_true('Admin administers same-tenant learned term',
 (public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000001',true)).is_active=true);
select pg_temp.assert_forbidden_with('Admin cannot administer cross-tenant learned term',$sql$
 select public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000002',false)
$sql$,'learned_term_forbidden');
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000099","role":"authenticated"}';
select pg_temp.assert_forbidden_with('Authenticated user without membership cannot administer learned term',$sql$
 select public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000001',false)
$sql$,'learned_term_forbidden');
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.assert_eq('Cross-tenant analysis run SELECT is blocked',count(*),0)
from public.estimate_analysis_runs where id='ac000000-0000-4000-8000-000000000002';
with changed as (
 update public.estimate_analysis_runs set attempts=1 where id='ac000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant analysis run UPDATE is blocked',count(*),0) from changed;
with removed as (
 delete from public.estimate_analysis_runs where id='ac000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Cross-tenant analysis run DELETE is blocked',count(*),0) from removed;
select pg_temp.assert_forbidden('Member cannot insert estimate for another tenant',$sql$
 insert into public.estimates(company_id,source_type,created_by,title)
 values ('a1000000-0000-4000-8000-000000000002','photo_ai','a2000000-0000-4000-8000-000000000001','Blocked')
$sql$);
select pg_temp.assert_forbidden('Approval cannot be bypassed during insert',$sql$
 insert into public.estimates(company_id,source_type,created_by,title,status,approved_by,approved_at)
 values ('a1000000-0000-4000-8000-000000000001','manual','a2000000-0000-4000-8000-000000000001',
 'Bypass','approved','a2000000-0000-4000-8000-000000000001',now())
$sql$);
select pg_temp.assert_forbidden('Estimate rejects cross-tenant client',$sql$
 update public.estimates set client_id='a4000000-0000-4000-8000-000000000002'
 where id='a7000000-0000-4000-8000-000000000010'
$sql$);
select pg_temp.assert_forbidden('Estimate rejects cross-tenant project',$sql$
 update public.estimates set project_id='a5000000-0000-4000-8000-000000000002'
 where id='a7000000-0000-4000-8000-000000000010'
$sql$);
select pg_temp.assert_forbidden('Estimate rejects cross-tenant division',$sql$
 update public.estimates set division_id='a3000000-0000-4000-8000-000000000002'
 where id='a7000000-0000-4000-8000-000000000010'
$sql$);
select pg_temp.assert_forbidden('Estimate rejects cross-tenant business unit',$sql$
 update public.estimates set business_unit_id='a6000000-0000-4000-8000-000000000002'
 where id='a7000000-0000-4000-8000-000000000010'
$sql$);
select pg_temp.assert_forbidden('Estimate rejects cross-tenant parent',$sql$
 update public.estimates set parent_estimate_id='a7000000-0000-4000-8000-000000000002',version_number=2
 where id='a7000000-0000-4000-8000-000000000010'
$sql$);

insert into public.estimate_items(id,estimate_id,company_id,description,item_type,planned_cost,client_price)
values ('a8000000-0000-4000-8000-000000000010','a7000000-0000-4000-8000-000000000010',
 'a1000000-0000-4000-8000-000000000001','Labor','labor',2000,3000);
select pg_temp.assert_forbidden_with('Server rejects title, PII and financial field types',$sql$
 select public.record_estimate_learned_terms('a7000000-0000-4000-8000-000000000010',
 '[{"observed_term":"Old","corrected_term":"New","term_type":"name","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"client_name","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"address","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"charge_amount","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"planned_cost","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"client_price","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"quantity","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"Old","corrected_term":"New","term_type":"currency","target_id":"a8000000-0000-4000-8000-000000000010"}]'::jsonb)
$sql$,'invalid_learned_term_type');
select pg_temp.assert_eq('Server discards identifying and monetary values in allowed fields',
 public.record_estimate_learned_terms('a7000000-0000-4000-8000-000000000010',
 '[{"observed_term":"old@example.com","corrected_term":"new@example.com","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"808-555-1234","corrected_term":"808-555-9999","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"https://old.invalid","corrected_term":"www.new.invalid","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"123-45-6789","corrected_term":"987-65-4321","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"cost $20","corrected_term":"cost $30","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000010"},
   {"observed_term":"1200","corrected_term":"1300","term_type":"unit","target_id":"a8000000-0000-4000-8000-000000000010"}]'::jsonb),0);
select pg_temp.assert_forbidden('Item rejects cross-tenant estimate association',$sql$
 insert into public.estimate_items(estimate_id,company_id,description)
 values ('a7000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000002','Blocked')
$sql$);
select pg_temp.assert_forbidden('Company A cannot insert child using Company B identity',$sql$
 insert into public.estimate_items(estimate_id,company_id,description)
 values ('a7000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','Blocked B child')
$sql$);
select pg_temp.assert_forbidden('Mixed Company A and Company B estimate is rejected',$sql$
 insert into public.estimate_items(estimate_id,company_id,description)
 values ('a7000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Mixed child')
$sql$);

insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
values ('a9000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 'a7000000-0000-4000-8000-000000000010',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000010/a9000000-0000-4000-8000-000000000001.jpg',
 1,repeat('a',64),'image/jpeg',1000,
 'a2000000-0000-4000-8000-000000000001');

insert into storage.objects(id,bucket_id,name,owner,metadata)
values ('ad000000-0000-4000-8000-000000000001','estimate-images',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000010/a9000000-0000-4000-8000-000000000001.jpg',
 'a2000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg"}'::jsonb);
select pg_temp.assert_eq('Company A reads its authorized storage object',count(*),1)
from storage.objects where id='ad000000-0000-4000-8000-000000000001';
update storage.objects set metadata='{"owner":"company-a","mimetype":"image/jpeg"}'::jsonb
where id='ad000000-0000-4000-8000-000000000001';
select pg_temp.assert_true('Company A updates its authorized storage object',exists(
 select 1 from storage.objects where id='ad000000-0000-4000-8000-000000000001'
 and metadata->>'owner'='company-a'
));
select pg_temp.assert_eq('Draft estimate storage DELETE policy remains open',count(*),1)
from storage.objects o
where o.id='ad000000-0000-4000-8000-000000000001'
  and exists (
    select 1 from public.estimates e
    where e.id='a7000000-0000-4000-8000-000000000010'
      and e.status <> 'approved'
      and public.company_writes_allowed(e.company_id)
      and public.can_manage_estimate(e.id,e.company_id)
  );
select pg_temp.assert_eq('Company A cannot read Company B storage metadata',count(*),0)
from storage.objects where id='ad000000-0000-4000-8000-000000000002';
select pg_temp.assert_forbidden('Company A cannot insert into Company B storage path',$sql$
 insert into storage.objects(bucket_id,name,owner,metadata)
 values ('estimate-images',
 'a1000000-0000-4000-8000-000000000002/a7000000-0000-4000-8000-000000000002/a9000000-0000-4000-8000-000000000099.jpg',
 'a2000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg"}'::jsonb)
$sql$);
with changed as (
 update storage.objects set metadata='{"blocked":true,"mimetype":"image/jpeg"}'::jsonb
 where id='ad000000-0000-4000-8000-000000000002' returning 1
) select pg_temp.assert_eq('Company A cannot update Company B storage object',count(*),0) from changed;
select pg_temp.assert_forbidden_with('Company A cannot directly delete Company B storage metadata',$sql$
 delete from storage.objects where id='ad000000-0000-4000-8000-000000000002'
$sql$,'Direct deletion from storage tables is not allowed');
select pg_temp.assert_forbidden('Storage rejects a non-contract path',$sql$
 insert into storage.objects(bucket_id,name,owner,metadata)
 values ('estimate-images','a1000000-0000-4000-8000-000000000001/not-an-estimate/image.jpg',
 'a2000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg"}'::jsonb)
$sql$);
select pg_temp.assert_forbidden('Duplicate image hash is idempotently rejected',$sql$
 insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
 values ('a9000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
 'a7000000-0000-4000-8000-000000000010',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000010/a9000000-0000-4000-8000-000000000002.jpg',2,
 repeat('a',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000001')
$sql$);

insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010','request-1',
 repeat('b',64),'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001');
select pg_temp.assert_forbidden('Analysis request key is idempotent per company',$sql$
 insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010','request-1',
 repeat('c',64),'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001')
$sql$);
select pg_temp.assert_forbidden('Image rejects cross-tenant estimate association',$sql$
 insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
 values ('a9000000-0000-4000-8000-000000000088','a1000000-0000-4000-8000-000000000001',
 'a7000000-0000-4000-8000-000000000002',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000002/a9000000-0000-4000-8000-000000000088.jpg',
 1,repeat('8',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000001')
$sql$);
select pg_temp.assert_forbidden('Question rejects cross-tenant estimate association',$sql$
 insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002',1,'scope','Blocked?')
$sql$);
select pg_temp.assert_forbidden('Analysis run rejects cross-tenant estimate association',$sql$
 insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002','blocked-cross-run',
 repeat('7',64),'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001')
$sql$);
select pg_temp.assert_forbidden('Ordered image-set replay is idempotently rejected',$sql$
 insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010','request-same-images',
 repeat('b',64),'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001')
$sql$);
insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010','request-next-stage',
 repeat('b',64),'extraction','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001');

insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question) values
 ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010',1,'scope','Scope?'),
 ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010',2,'hidden_cost','Hidden cost?'),
 ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010',3,'profitability','Profit?');
insert into public.estimates(id,company_id,source_type,created_by,title,status,schema_version)
values ('a7000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001','photo_ai',
 'a2000000-0000-4000-8000-000000000001','Incomplete questions','needs_answers','estimate-photo-v1');
insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question,answer,answered_by,answered_at) values
 ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000011',1,'scope','Scope?','Yes','a2000000-0000-4000-8000-000000000001',now()),
 ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000011',2,'hidden_cost','Hidden?','No','a2000000-0000-4000-8000-000000000001',now());
select pg_temp.assert_forbidden_with('Photo AI approval requires all three answered dimensions',$sql$
 update public.estimates set status='approved' where id='a7000000-0000-4000-8000-000000000011'
$sql$,'estimate_requires_exactly_three_answers');
select pg_temp.assert_forbidden('Question ordinal cannot exceed three',$sql$
 insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010',4,'scope','Fourth?')
$sql$);
update public.estimate_questions
set answer='Confirmed',answered_by='a2000000-0000-4000-8000-000000000001',answered_at=now()
where estimate_id='a7000000-0000-4000-8000-000000000010';
update public.estimates set status='approved' where id='a7000000-0000-4000-8000-000000000010';
select pg_temp.assert_true('Creator approves after exactly three answers',exists(
 select 1 from public.estimates where id='a7000000-0000-4000-8000-000000000010'
 and status='approved' and approved_by='a2000000-0000-4000-8000-000000000001' and approved_at is not null
));
select pg_temp.assert_eq('Approved estimate storage evidence remains readable',count(*),1)
from storage.objects where id='ad000000-0000-4000-8000-000000000001';
select pg_temp.assert_forbidden('Approved estimate rejects new storage evidence',$sql$
 insert into storage.objects(bucket_id,name,owner,metadata)
 values ('estimate-images',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000010/a9000000-0000-4000-8000-000000000098.jpg',
 'a2000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg"}'::jsonb)
$sql$);
with changed as (
 update storage.objects set metadata='{"blocked_after_approval":true,"mimetype":"image/jpeg"}'::jsonb
 where id='ad000000-0000-4000-8000-000000000001' returning 1
) select pg_temp.assert_eq('Approved estimate storage evidence UPDATE is blocked',count(*),0) from changed;
select pg_temp.assert_forbidden_with('Approved estimate storage evidence direct DELETE is blocked',$sql$
 delete from storage.objects where id='ad000000-0000-4000-8000-000000000001'
$sql$,'Direct deletion from storage tables is not allowed');
select pg_temp.assert_eq('Approved estimate storage evidence DELETE policy is closed',count(*),0)
from storage.objects o
where o.id='ad000000-0000-4000-8000-000000000001'
  and exists (
    select 1 from public.estimates e
    where e.id='a7000000-0000-4000-8000-000000000010'
      and e.status <> 'approved'
      and public.company_writes_allowed(e.company_id)
      and public.can_manage_estimate(e.id,e.company_id)
  );
select pg_temp.assert_forbidden_with('Approved estimate UPDATE is immutable',$sql$
 update public.estimates set title='Changed' where id='a7000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_immutable');
do $approved_fields$
declare assignment text;
begin
  foreach assignment in array array[
    'total=1', 'charge_amount=1', 'target_type=''absolute_profit''', 'target_value=1',
    'risk_level=''high''', 'risk_summary=''Changed''',
    'client_id=null', 'project_id=null', 'division_id=null', 'business_unit_id=null', 'title=''Changed scope'''
  ] loop
    perform pg_temp.assert_forbidden_with(
      'Approved estimate economic/scope field is immutable: ' || assignment,
      format('update public.estimates set %s where id=%L', assignment, 'a7000000-0000-4000-8000-000000000010'),
      'approved_estimate_immutable'
    );
  end loop;
end
$approved_fields$;
select pg_temp.assert_forbidden_with('Approved estimate DELETE is immutable',$sql$
 delete from public.estimates where id='a7000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_immutable');
select pg_temp.assert_forbidden_with('Approved estimate item INSERT is immutable',$sql$
 insert into public.estimate_items(estimate_id,company_id,description,item_type,planned_cost)
 values ('a7000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','Late item','other',1)
$sql$,'approved_estimate_items_immutable');
select pg_temp.assert_forbidden_with('Approved estimate item UPDATE is immutable',$sql$
 update public.estimate_items set planned_cost=1 where id='a8000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_items_immutable');
do $approved_item_fields$
declare assignment text;
begin
  foreach assignment in array array[
    'description=''Changed''', 'quantity=9', 'unit=''ea''', 'unit_price=1',
    'total=1', 'planned_cost=1', 'client_price=1'
  ] loop
    perform pg_temp.assert_forbidden_with(
      'Approved item financial field is immutable: ' || assignment,
      format('update public.estimate_items set %s where id=%L', assignment, 'a8000000-0000-4000-8000-000000000010'),
      'approved_estimate_items_immutable'
    );
  end loop;
end
$approved_item_fields$;
select pg_temp.assert_forbidden_with('Approved estimate item DELETE is immutable',$sql$
 delete from public.estimate_items where id='a8000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_items_immutable');
select pg_temp.assert_forbidden_with('Approved estimate question INSERT is immutable',$sql$
 insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010',1,'scope','Late?')
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved estimate question UPDATE is immutable',$sql$
 update public.estimate_questions set answer='Changed'
 where estimate_id='a7000000-0000-4000-8000-000000000010' and ordinal=1
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved estimate question DELETE is immutable',$sql$
 delete from public.estimate_questions
 where estimate_id='a7000000-0000-4000-8000-000000000010' and ordinal=1
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved estimate image INSERT is immutable',$sql$
 insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
 values ('a9000000-0000-4000-8000-000000000099','a1000000-0000-4000-8000-000000000001',
 'a7000000-0000-4000-8000-000000000010',
 'a1000000-0000-4000-8000-000000000001/a7000000-0000-4000-8000-000000000010/a9000000-0000-4000-8000-000000000099.jpg',
 2,repeat('9',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000001')
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved estimate image UPDATE is immutable',$sql$
 update public.estimate_images set byte_size=1001 where estimate_id='a7000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved estimate image DELETE is immutable',$sql$
 delete from public.estimate_images where estimate_id='a7000000-0000-4000-8000-000000000010'
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved analysis run INSERT is immutable',$sql$
 insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
 values ('a1000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000010','late-run',
 repeat('8',64),'analysis','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000001')
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved analysis run UPDATE is immutable',$sql$
 update public.estimate_analysis_runs set attempts=1 where request_key='request-1'
$sql$,'approved_estimate_children_immutable');
select pg_temp.assert_forbidden_with('Approved analysis run DELETE is immutable',$sql$
 delete from public.estimate_analysis_runs where request_key='request-1'
$sql$,'approved_estimate_children_immutable');
select public.create_estimate_revision('a7000000-0000-4000-8000-000000000010') as revision_id \gset
select pg_temp.assert_true('Approved estimate creates a versioned draft revision',exists(
 select 1 from public.estimates
 where id=:'revision_id'::uuid
 and version_number=2
 and parent_estimate_id='a7000000-0000-4000-8000-000000000010'
 and status='draft'
));
select pg_temp.assert_true('Revision resets approval and future project idempotency',exists(
 select 1 from public.estimates
 where id=:'revision_id'::uuid
   and approved_at is null and approved_by is null and project_creation_key is null
));
select pg_temp.assert_forbidden('Concurrent/replayed next-version creation is serialized by uniqueness',$sql$
 select public.create_estimate_revision('a7000000-0000-4000-8000-000000000010')
$sql$);

-- A different ordinary member cannot approve another creator's estimate.
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}';
with changed as (
 update public.estimates set status='approved' where id='a7000000-0000-4000-8000-000000000001' returning 1
) select pg_temp.assert_eq('Non-creator member cannot approve another estimate',count(*),0) from changed;

-- Manager may approve an estimate created by a member.
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.estimates set status='approved'
where id='a7000000-0000-4000-8000-000000000001';
select pg_temp.assert_true('Manager can approve a legacy estimate',exists(
 select 1 from public.estimates where id='a7000000-0000-4000-8000-000000000001'
 and approved_by='a2000000-0000-4000-8000-000000000002'
));

-- Admin may approve an estimate created by a member.
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000007","role":"authenticated"}';
update public.estimates set status='approved'
where id='a7000000-0000-4000-8000-000000000003';
select pg_temp.assert_true('Admin can approve a member estimate',exists(
 select 1 from public.estimates where id='a7000000-0000-4000-8000-000000000003'
 and approved_by='a2000000-0000-4000-8000-000000000007'
));

-- Expired trial remains readable but every foundation write is blocked.
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000005","role":"authenticated"}';
select pg_temp.assert_eq('Expired trial SELECT estimates',count(*),1) from public.estimates where id='a7000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT estimate_items',count(*),1) from public.estimate_items where id='a8000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT estimate_images',count(*),1) from public.estimate_images where id='a9000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT estimate_questions',count(*),1) from public.estimate_questions where id='aa000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT estimate_learned_terms',count(*),1) from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT estimate_analysis_runs',count(*),1) from public.estimate_analysis_runs where id='ac000000-0000-4000-8000-000000000004';
select pg_temp.assert_eq('Expired trial SELECT storage evidence',count(*),1)
from storage.objects where id='ad000000-0000-4000-8000-000000000003';
select pg_temp.assert_forbidden('Expired trial INSERT storage evidence',$sql$
 insert into storage.objects(bucket_id,name,owner,metadata)
 values ('estimate-images',
 'a1000000-0000-4000-8000-000000000003/a7000000-0000-4000-8000-000000000004/a9000000-0000-4000-8000-000000000097.jpg',
 'a2000000-0000-4000-8000-000000000005','{"mimetype":"image/jpeg"}'::jsonb)
$sql$);
with changed as (
 update storage.objects set metadata='{"blocked_by_trial":true,"mimetype":"image/jpeg"}'::jsonb
 where id='ad000000-0000-4000-8000-000000000003' returning 1
) select pg_temp.assert_eq('Expired trial UPDATE storage evidence is blocked',count(*),0) from changed;
select pg_temp.assert_eq('Expired trial DELETE storage policy is closed',count(*),0)
from storage.objects o
where o.id='ad000000-0000-4000-8000-000000000003'
  and exists (
    select 1 from public.estimates e
    where e.id='a7000000-0000-4000-8000-000000000004'
      and e.status <> 'approved'
      and public.company_writes_allowed(e.company_id)
      and public.can_manage_estimate(e.id,e.company_id)
  );

select pg_temp.assert_forbidden_with('Expired trial INSERT estimates',$sql$
 insert into public.estimates(company_id,source_type,created_by,title)
 values ('a1000000-0000-4000-8000-000000000003','manual','a2000000-0000-4000-8000-000000000005','Expired')
$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial UPDATE estimates',$sql$update public.estimates set title='Blocked' where id='a7000000-0000-4000-8000-000000000004'$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial DELETE estimates',$sql$delete from public.estimates where id='a7000000-0000-4000-8000-000000000004'$sql$,'trial_expired');

select pg_temp.assert_forbidden_with('Expired trial INSERT estimate_items',$sql$
 insert into public.estimate_items(estimate_id,company_id,description) values
 ('a7000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003','Blocked')
$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial UPDATE estimate_items',$sql$update public.estimate_items set description='Blocked' where id='a8000000-0000-4000-8000-000000000004'$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial DELETE estimate_items',$sql$delete from public.estimate_items where id='a8000000-0000-4000-8000-000000000004'$sql$,'trial_expired');

select pg_temp.assert_forbidden_with('Expired trial INSERT estimate_images',$sql$
 insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by) values
 ('a9000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-000000000004',
 'a1000000-0000-4000-8000-000000000003/a7000000-0000-4000-8000-000000000004/a9000000-0000-4000-8000-000000000005.jpg',
 2,repeat('5',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000005')
$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial UPDATE estimate_images',$sql$update public.estimate_images set byte_size=1001 where id='a9000000-0000-4000-8000-000000000004'$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial DELETE estimate_images',$sql$delete from public.estimate_images where id='a9000000-0000-4000-8000-000000000004'$sql$,'trial_expired');

select pg_temp.assert_forbidden_with('Expired trial INSERT estimate_questions',$sql$
 insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question) values
 ('a1000000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-000000000004',2,'hidden_cost','Blocked?')
$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial UPDATE estimate_questions',$sql$update public.estimate_questions set question='Blocked?' where id='aa000000-0000-4000-8000-000000000004'$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial DELETE estimate_questions',$sql$delete from public.estimate_questions where id='aa000000-0000-4000-8000-000000000004'$sql$,'trial_expired');

select pg_temp.assert_forbidden_with('Expired trial record learned terms RPC',$sql$
 select public.record_estimate_learned_terms('a7000000-0000-4000-8000-000000000004',
   '[{"observed_term":"Old work","corrected_term":"New work","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000004"}]'::jsonb)
$sql$,'trial_expired');
select pg_temp.assert_forbidden('Direct learned term UPDATE remains unavailable',$sql$update public.estimate_learned_terms set confirmations=2 where id='ab000000-0000-4000-8000-000000000004'$sql$);
select pg_temp.assert_forbidden('Direct learned term DELETE remains unavailable',$sql$delete from public.estimate_learned_terms where id='ab000000-0000-4000-8000-000000000004'$sql$);

select pg_temp.assert_forbidden_with('Expired trial INSERT estimate_analysis_runs',$sql$
 insert into public.estimate_analysis_runs(company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by) values
 ('a1000000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-000000000004','blocked-run',repeat('4',64),
 'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000005')
$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial UPDATE estimate_analysis_runs',$sql$update public.estimate_analysis_runs set attempts=1 where id='ac000000-0000-4000-8000-000000000004'$sql$,'trial_expired');
select pg_temp.assert_forbidden_with('Expired trial DELETE estimate_analysis_runs',$sql$delete from public.estimate_analysis_runs where id='ac000000-0000-4000-8000-000000000004'$sql$,'trial_expired');

-- Explicit exemption uses the same central gate and permits writes on all six entities.
set local request.jwt.claims='{"sub":"a2000000-0000-4000-8000-000000000006","role":"authenticated"}';
insert into public.estimates(id,company_id,source_type,created_by,title)
values ('a7000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','manual','a2000000-0000-4000-8000-000000000006','Exempt');
insert into public.estimate_items(id,estimate_id,company_id,description)
values ('a8000000-0000-4000-8000-000000000006','a7000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','Exempt item');
insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by)
values ('a9000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-000000000006',
 'a1000000-0000-4000-8000-000000000004/a7000000-0000-4000-8000-000000000006/a9000000-0000-4000-8000-000000000006.jpg',
 1,repeat('6',64),'image/jpeg',1000,'a2000000-0000-4000-8000-000000000006');
insert into public.estimate_questions(id,company_id,estimate_id,ordinal,category,question)
values ('aa000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-000000000006',1,'scope','Exempt?');
select public.record_estimate_learned_terms('a7000000-0000-4000-8000-000000000006',
  '[{"observed_term":"Exempt itam","corrected_term":"Exempt item","term_type":"alias","target_id":"a8000000-0000-4000-8000-000000000006"}]'::jsonb);
insert into public.estimate_analysis_runs(id,company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,created_by)
values ('ac000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-000000000006',
 'exempt-run',repeat('6',64),'ingestion','pending','estimate-photo-v1','a2000000-0000-4000-8000-000000000006');
insert into storage.objects(id,bucket_id,name,owner,metadata)
values ('ad000000-0000-4000-8000-000000000006','estimate-images',
 'a1000000-0000-4000-8000-000000000004/a7000000-0000-4000-8000-000000000006/a9000000-0000-4000-8000-000000000006.jpg',
 'a2000000-0000-4000-8000-000000000006','{"mimetype":"image/jpeg"}'::jsonb);
update storage.objects set metadata='{"trial_exempt":true,"mimetype":"image/jpeg"}'::jsonb
where id='ad000000-0000-4000-8000-000000000006';
select pg_temp.assert_true('Trial-exempt storage INSERT and UPDATE are permitted',exists(
 select 1 from storage.objects where id='ad000000-0000-4000-8000-000000000006'
 and metadata->>'trial_exempt'='true'
));
select pg_temp.assert_eq('Trial-exempt storage DELETE policy remains open',count(*),1)
from storage.objects o
where o.id='ad000000-0000-4000-8000-000000000006'
  and exists (
    select 1 from public.estimates e
    where e.id='a7000000-0000-4000-8000-000000000006'
      and e.status <> 'approved'
      and public.company_writes_allowed(e.company_id)
      and public.can_manage_estimate(e.id,e.company_id)
  );
select pg_temp.assert_eq('Trial-exempt writes all six entities',(
 (select count(*) from public.estimates where id='a7000000-0000-4000-8000-000000000006') +
 (select count(*) from public.estimate_items where id='a8000000-0000-4000-8000-000000000006') +
 (select count(*) from public.estimate_images where id='a9000000-0000-4000-8000-000000000006') +
 (select count(*) from public.estimate_questions where id='aa000000-0000-4000-8000-000000000006') +
 (select count(*) from public.estimate_learned_terms where source_estimate_id='a7000000-0000-4000-8000-000000000006') +
 (select count(*) from public.estimate_analysis_runs where id='ac000000-0000-4000-8000-000000000006')
),6);

reset role;
set local role anon;
select pg_temp.assert_forbidden('Anon has no estimate access',$sql$select * from public.estimates$sql$);
select pg_temp.assert_forbidden('Anon cannot execute learned term administration RPC',$sql$
 select public.set_estimate_learned_term_active('ab000000-0000-4000-8000-000000000001',false)
$sql$);
select pg_temp.assert_eq('Anon reads zero estimate image objects',count(*),0)
from storage.objects where bucket_id='estimate-images';
reset role;

select pg_temp.assert_eq('Request key and image-set/stage may repeat safely across companies',count(*),2)
from public.estimate_analysis_runs where request_key='request-1';

select pg_temp.assert_true('Estimate image bucket remains private',exists(
 select 1 from storage.buckets where id='estimate-images' and public=false
));
select pg_temp.assert_eq('Estimate image policies grant nothing to anon or public',count(*),0)
from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'estimate images%'
  and (roles::text like '%anon%' or roles::text like '%public%');

select pg_temp.assert_eq('Foundation creates no expenses',count(*),0)
from public.expenses where company_id='a1000000-0000-4000-8000-000000000001';
select pg_temp.assert_eq('Foundation creates no payments',count(*),0)
from public.payments where company_id='a1000000-0000-4000-8000-000000000001';
select pg_temp.assert_eq('Foundation creates no worker check-ins',count(*),0)
from public.worker_checkins where company_id='a1000000-0000-4000-8000-000000000001';
select pg_temp.assert_eq('Foundation creates no financial ledger rows',count(*),0)
from public.project_financial_ledger where company_id='a1000000-0000-4000-8000-000000000001';

rollback;
