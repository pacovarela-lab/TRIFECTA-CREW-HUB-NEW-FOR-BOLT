\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_true(label text,actual boolean) returns void language plpgsql as $$begin if actual is not true then raise exception '%',label; end if; raise notice 'PASS %',label; end$$;
create or replace function pg_temp.assert_forbidden(label text,statement text,expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if position(lower(expected) in lower(sqlerrm))=0 then raise exception '% expected %, got %',label,expected,sqlerrm; end if; raise notice 'PASS %',label; return; end; raise exception '% unexpectedly succeeded',label; end$$;

insert into public.companies(id,name,slug,trial_status,trial_ends_at) values
('d1000000-0000-4000-8000-000000000001','Approval A','approval-a','trial',now()+interval '7 days'),
('d1000000-0000-4000-8000-000000000002','Approval B','approval-b','trial',now()+interval '7 days'),
('d1000000-0000-4000-8000-000000000003','Approval Expired','approval-expired','trial',now()-interval '1 day');
insert into auth.users(id,email) values
('d2000000-0000-4000-8000-000000000001','creator@example.invalid'),('d2000000-0000-4000-8000-000000000002','manager@example.invalid'),
('d2000000-0000-4000-8000-000000000003','admin@example.invalid'),('d2000000-0000-4000-8000-000000000004','member@example.invalid'),
('d2000000-0000-4000-8000-000000000005','other@example.invalid'),('d2000000-0000-4000-8000-000000000006','expired@example.invalid');
update public.profiles set company_id='d1000000-0000-4000-8000-000000000001' where id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000004');
update public.profiles set company_id='d1000000-0000-4000-8000-000000000002' where id='d2000000-0000-4000-8000-000000000005';
update public.profiles set company_id='d1000000-0000-4000-8000-000000000003' where id='d2000000-0000-4000-8000-000000000006';
insert into public.user_roles(user_id,company_id,role) values
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','member'),('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','manager'),
('d2000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','admin'),('d2000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','member'),
('d2000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000002','member'),('d2000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000003','member');
insert into public.divisions(id,company_id,name,slug) values('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Main','main');
insert into public.clients(id,company_id,name) values('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Test Client');

insert into public.estimates(id,company_id,source,source_type,created_by,imported_by,title,status,total,charge_amount,schema_version) values
('d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Interior Painting','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Incomplete','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-000000000006','Expired','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Manager approval','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Admin approval','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Missing answer','reviewed',100,100,'estimate-photo-v1'),
('d7000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Not reviewed','needs_answers',100,100,'estimate-photo-v1');
insert into public.estimate_items(id,estimate_id,company_id,description,quantity,unit,unit_price,total,position,item_type,description_original,description_normalized,planned_cost,client_price,extraction_status,provenance) values
('d8000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Paint',1,'job',100,100,1,'labor','Paint','Interior painting',120,100,'confirmed','observed'),
('d8000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','Unknown',1,'job',100,100,1,'labor','Unknown','Unknown',null,100,'uncertain','observed'),
('d8000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','Paint',1,'job',100,100,1,'labor','Paint','Paint',80,100,'confirmed','observed'),
('d8000000-0000-4000-8000-000000000004','d7000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','Paint',1,'job',100,100,1,'labor','Paint','Paint',80,100,'confirmed','observed'),
('d8000000-0000-4000-8000-000000000005','d7000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','Paint',1,'job',100,100,1,'labor','Paint','Paint',80,100,'confirmed','observed'),
('d8000000-0000-4000-8000-000000000006','d7000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001','Paint',1,'job',100,100,1,'labor','Paint','Paint',80,100,'confirmed','observed'),
('d8000000-0000-4000-8000-000000000007','d7000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000001','Paint',1,'job',100,100,1,'labor','Paint','Paint',80,100,'confirmed','observed');
insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question,answer,answered_by,answered_at)
select e.company_id,e.id,v.ordinal,v.category,v.question,'Confirmed',e.created_by,now() from public.estimates e cross join (values(1,'scope','Scope?'),(2,'hidden_cost','Costs?'),(3,'profitability','Price?')) v(ordinal,category,question);
delete from public.estimate_questions where estimate_id='d7000000-0000-4000-8000-000000000006' and ordinal=3;

set local role authenticated;
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000004","role":"authenticated"}';
select pg_temp.assert_forbidden('Member non creator approval blocked',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000001')$sql$,'estimate_approval_forbidden');
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000005","role":"authenticated"}';
select pg_temp.assert_forbidden('Cross tenant approval blocked',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000001')$sql$,'estimate_approval_forbidden');
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000006","role":"authenticated"}';
select pg_temp.assert_forbidden('Expired trial approval blocked',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000003')$sql$,'trial_expired');
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.assert_forbidden('Material uncertainty blocks approval',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000002')$sql$,'material_monetary_uncertainty_unresolved');
select pg_temp.assert_forbidden('Fewer than three answers blocked',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000006')$sql$,'estimate_requires_exactly_three_answers');
select pg_temp.assert_forbidden('Reviewed status required',$sql$select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000007')$sql$,'reviewed_estimate_required');
select pg_temp.assert_forbidden('Direct approved insert blocked',$sql$insert into public.estimates(company_id,source,source_type,created_by,imported_by,title,status,total,charge_amount) values('d1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Direct','approved',1,1)$sql$,'estimate_must_be_approved_by_transition');
select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000001');
select pg_temp.assert_true('Creator approval derives actor and time',exists(select 1 from public.estimates where id='d7000000-0000-4000-8000-000000000001' and status='approved' and approved_by='d2000000-0000-4000-8000-000000000001' and approved_at is not null));
select pg_temp.assert_forbidden('Approved item immutable',$sql$update public.estimate_items set client_price=101 where id='d8000000-0000-4000-8000-000000000001'$sql$,'approved_estimate_items_immutable');
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000004');
select pg_temp.assert_true('Manager approval allowed',exists(select 1 from public.estimates where id='d7000000-0000-4000-8000-000000000004' and approved_by='d2000000-0000-4000-8000-000000000002'));
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.approve_photo_estimate('d7000000-0000-4000-8000-000000000005');
select pg_temp.assert_true('Admin approval allowed',exists(select 1 from public.estimates where id='d7000000-0000-4000-8000-000000000005' and approved_by='d2000000-0000-4000-8000-000000000003'));
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.create_work_from_estimate('d7000000-0000-4000-8000-000000000001','work-key-1','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other') as project_id \gset
select pg_temp.assert_true('Create Work creates one project and links estimate',(select count(*)=1 from public.projects where id=:'project_id') and exists(select 1 from public.estimates where id='d7000000-0000-4000-8000-000000000001' and project_id=:'project_id' and project_creation_key='work-key-1'));
select pg_temp.assert_true('Create Work copies approved estimated total',exists(select 1 from public.projects where id=:'project_id' and estimated_total=100));
select pg_temp.assert_true('Create Work retry returns same project',public.create_work_from_estimate('d7000000-0000-4000-8000-000000000001','work-key-1','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other')=:'project_id');
select pg_temp.assert_true('Concurrent Create Work is serialized',position('for update' in lower(pg_get_functiondef('public.create_work_from_estimate(uuid,text,uuid,uuid,text,uuid,public.project_type)'::regprocedure)))>0);
select pg_temp.assert_forbidden('Project key cannot be reused incorrectly',$sql$select public.create_work_from_estimate('d7000000-0000-4000-8000-000000000001','other-key','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other')$sql$,'project_creation_key_mismatch');
select pg_temp.assert_forbidden('Same key cannot create a project for another estimate',$sql$select public.create_work_from_estimate('d7000000-0000-4000-8000-000000000005','work-key-1','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other')$sql$,'estimates_project_creation_key_uniq');
select pg_temp.assert_true('Failed cross-estimate key reuse rolls back project insert',(select count(*)=1 from public.projects where company_id='d1000000-0000-4000-8000-000000000001'));
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000005","role":"authenticated"}';
select pg_temp.assert_forbidden('Cross tenant Create Work blocked',$sql$select public.create_work_from_estimate('d7000000-0000-4000-8000-000000000004','cross-key','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other')$sql$,'create_work_forbidden');
reset role;
set local role postgres;
alter table public.companies disable trigger trg_protect_trial_columns;
update public.companies set trial_ends_at=now()-interval '1 day' where id='d1000000-0000-4000-8000-000000000001';
alter table public.companies enable trigger trg_protect_trial_columns;
set local role authenticated;
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_forbidden('Expired trial Create Work blocked',$sql$select public.create_work_from_estimate('d7000000-0000-4000-8000-000000000004','expired-key','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',null,null,'other')$sql$,'trial_expired');
reset role;
set local role postgres;
alter table public.companies disable trigger trg_protect_trial_columns;
update public.companies set trial_ends_at=now()+interval '7 days' where id='d1000000-0000-4000-8000-000000000001';
alter table public.companies enable trigger trg_protect_trial_columns;
set local role authenticated;
set local request.jwt.claims='{"sub":"d2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.create_estimate_revision('d7000000-0000-4000-8000-000000000001') as revision_id \gset
select pg_temp.assert_true('Revision is draft with approval and creation key cleared',exists(select 1 from public.estimates where id=:'revision_id' and status='draft' and approved_at is null and approved_by is null and project_creation_key is null));
reset role;
select pg_temp.assert_true('Zero financial side effects',(select count(*)=0 from public.expenses where company_id::text like 'd1000000-%') and (select count(*)=0 from public.payments where company_id::text like 'd1000000-%') and (select count(*)=0 from public.worker_checkins where company_id::text like 'd1000000-%') and (select count(*)=0 from public.project_financial_ledger where company_id::text like 'd1000000-%'));
rollback;
