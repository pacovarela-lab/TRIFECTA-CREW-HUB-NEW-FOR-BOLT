\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_true(label text, actual boolean) returns void language plpgsql as $$ begin if actual is not true then raise exception '%',label; end if; raise notice 'PASS %',label; end $$;
create or replace function pg_temp.assert_forbidden(label text, statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(lower(expected) in lower(sqlerrm))=0 then raise exception '% expected %, got %',label,expected,sqlerrm; end if; raise notice 'PASS %',label; return; end; raise exception '% unexpectedly succeeded',label; end $$;

insert into public.companies(id,name,slug,trial_status,trial_ends_at)
values
 ('e1000000-0000-4000-8000-000000000001','V11 Test','v11-test','trial',now()+interval '7 days'),
 ('e1000000-0000-4000-8000-000000000002','V11 Other','v11-other','trial',now()+interval '7 days');
insert into auth.users(id,email) values
 ('e2000000-0000-4000-8000-000000000001','v11@example.invalid'),
 ('e2000000-0000-4000-8000-000000000002','v11-other@example.invalid');
update public.profiles set company_id='e1000000-0000-4000-8000-000000000001' where id='e2000000-0000-4000-8000-000000000001';
update public.profiles set company_id='e1000000-0000-4000-8000-000000000002' where id='e2000000-0000-4000-8000-000000000002';
insert into public.user_roles(user_id,company_id,role) values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','member'),
 ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','member');
insert into public.estimates(id,company_id,source,source_type,created_by,imported_by,title,status,total,charge_amount,schema_version,currency_code)
values
 ('e7000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Uncertain','needs_answers',600,600,'estimate-photo-v1','USD'),
 ('e7000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Unreadable','reviewed',600,600,'estimate-photo-v1','USD');
insert into public.estimate_items(id,estimate_id,company_id,description,description_original,description_normalized,quantity,unit,unit_price,total,client_price,planned_cost,item_type,extraction_status,provenance,source_text,position)
values
 ('e8000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','GFCI swtch','GFCI swtch','GFCI swtch',1,'ea',600,600,600,null,'material','uncertain','observed','Electricidad: GFCI swtch 600',1),
 ('e8000000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Unreadable','Unreadable','Unreadable',1,'ea',600,600,600,300,'material','unreadable','observed','???',1);

set local role authenticated;
set local request.jwt.claims='{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select * from public.initialize_estimate_review_questions('e7000000-0000-4000-8000-000000000001','[{"ordinal":1,"category":"scope","question":"Scope?","reason":"scope"},{"ordinal":2,"category":"hidden_cost","question":"Missing planned cost?","reason":"cost"},{"ordinal":3,"category":"profitability","question":"Margin?","reason":"margin"}]');

select pg_temp.assert_forbidden('Intermediate answer failure rolls back the complete review',$sql$
  select public.save_estimate_human_review_v11(
    'e7000000-0000-4000-8000-000000000001','Should roll back',600,'USD',array['title'],
    '[{"id":"e8000000-0000-4000-8000-000000000001","description":"Should roll back","quantity":"1","unit":"ea","client_price":"600","planned_cost":"300","item_type":"material","confirmed_fields":["description"]}]',
    '[{"ordinal":1,"category":"scope","question":"New scope?","reason":"scope"},{"ordinal":2,"category":"hidden_cost","question":"New costs?","reason":"cost"},{"ordinal":3,"category":"profitability","question":"New margin?","reason":"margin"}]',
    (select jsonb_agg(jsonb_build_object('id',id,'answer',case when ordinal=3 then '' else 'Sí' end) order by ordinal) from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001')
  )
$sql$,'invalid_review_answer');
select pg_temp.assert_true('Failed atomic review leaves corrections confirmations questions answers and status unchanged',
  exists(select 1 from public.estimates where id='e7000000-0000-4000-8000-000000000001' and title='Uncertain' and status='needs_answers' and human_confirmed_fields='{}')
  and exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and description_normalized='GFCI swtch' and human_confirmed_fields='{}')
  and exists(select 1 from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001' and category='scope' and question='Scope?' and answer is null)
  and (select count(*)=3 from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001' and answer is null));

select public.save_estimate_human_review_v11(
 'e7000000-0000-4000-8000-000000000001','Confirmed work',600,'USD',array['title','charge_amount'],
 '[{"id":"e8000000-0000-4000-8000-000000000001","description":"Electricidad: GFCI switch","quantity":"1","unit":"ea","client_price":"600","planned_cost":"300","item_type":"material","confirmed_fields":["description","planned_cost"]}]',
 '[{"ordinal":1,"category":"scope","question":"Scope confirmed?","reason":"scope"},{"ordinal":2,"category":"hidden_cost","question":"All hidden costs included?","reason":"cost complete"},{"ordinal":3,"category":"profitability","question":"Keep margin?","reason":"margin"}]',
 (select jsonb_agg(jsonb_build_object('id',id,'answer','Sí') order by ordinal) from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001')
);

select pg_temp.assert_true('Edited uncertain description becomes human confirmed',exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and extraction_status='confirmed' and human_confirmed_fields @> array['description']));
select pg_temp.assert_true('Confirm without textual mutation is recorded',exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and human_confirmed_fields @> array['planned_cost']));
select pg_temp.assert_true('Original and source text are preserved',exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and description_original='GFCI swtch' and source_text='Electricidad: GFCI swtch 600'));
select pg_temp.assert_true('Correction actor and timestamp are server derived',exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and corrected_by='e2000000-0000-4000-8000-000000000001' and corrected_at is not null));
select pg_temp.assert_true('USD is persisted without changing monetary values',exists(select 1 from public.estimates where id='e7000000-0000-4000-8000-000000000001' and currency_code='USD' and charge_amount=600) and exists(select 1 from public.estimate_items where id='e8000000-0000-4000-8000-000000000001' and client_price=600 and planned_cost=300));

select pg_temp.assert_true('Questions remain exactly three and hidden cost is recalculated',exists(select 1 from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001' and category='hidden_cost' and question='All hidden costs included?') and (select count(*)=3 from public.estimate_questions where estimate_id='e7000000-0000-4000-8000-000000000001'));

set local request.jwt.claims='{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_forbidden('V1.1 review RPC blocks cross-tenant UUID bypass',$sql$select public.save_estimate_human_review_v11('e7000000-0000-4000-8000-000000000001','x',1,'USD','{}','[]','[]','[]')$sql$,'estimate_review_forbidden');
set local request.jwt.claims='{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}';
reset role;
set local role postgres;
alter table public.companies disable trigger trg_protect_trial_columns;
update public.companies set trial_ends_at=now()-interval '1 day' where id='e1000000-0000-4000-8000-000000000001';
alter table public.companies enable trigger trg_protect_trial_columns;
set local role authenticated;
select pg_temp.assert_forbidden('V1.1 review RPC enforces expired trial',$sql$select public.save_estimate_human_review_v11('e7000000-0000-4000-8000-000000000001','x',1,'USD','{}','[]','[]','[]')$sql$,'trial_expired');
reset role;
set local role postgres;
alter table public.companies disable trigger trg_protect_trial_columns;
update public.companies set trial_ends_at=now()+interval '7 days' where id='e1000000-0000-4000-8000-000000000001';
alter table public.companies enable trigger trg_protect_trial_columns;
set local role authenticated;

select public.approve_photo_estimate('e7000000-0000-4000-8000-000000000001');
select pg_temp.assert_true('Approval accepts human confirmed values',exists(select 1 from public.estimates where id='e7000000-0000-4000-8000-000000000001' and status='approved'));
select pg_temp.assert_forbidden('V1.1 review RPC preserves approved immutability',$sql$select public.save_estimate_human_review_v11('e7000000-0000-4000-8000-000000000001','x',1,'USD','{}','[]','[]','[]')$sql$,'estimate_review_forbidden');

insert into public.estimate_questions(company_id,estimate_id,ordinal,category,question,answer,answered_by,answered_at)
select 'e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002',v.ordinal,v.category,'Q','Sí','e2000000-0000-4000-8000-000000000001',now()
from (values(1,'scope'),(2,'hidden_cost'),(3,'profitability')) v(ordinal,category);
select pg_temp.assert_forbidden('Unreadable unconfirmed item still blocks approval',$sql$select public.approve_photo_estimate('e7000000-0000-4000-8000-000000000002')$sql$,'material_monetary_uncertainty_unresolved');

reset role;
select pg_temp.assert_true('Zero financial side effects',(select count(*)=0 from public.expenses where company_id='e1000000-0000-4000-8000-000000000001') and (select count(*)=0 from public.payments where company_id='e1000000-0000-4000-8000-000000000001') and (select count(*)=0 from public.worker_checkins where company_id='e1000000-0000-4000-8000-000000000001') and (select count(*)=0 from public.project_financial_ledger where company_id='e1000000-0000-4000-8000-000000000001'));
rollback;
