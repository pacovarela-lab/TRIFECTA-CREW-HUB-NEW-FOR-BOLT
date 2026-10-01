\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_true(label text, actual boolean) returns void language plpgsql as $$ begin if actual is not true then raise exception '%',label; end if; raise notice 'PASS %',label; end $$;
create or replace function pg_temp.assert_forbidden(label text, statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if position(lower(expected) in lower(sqlerrm))=0 then raise exception '% expected %, got %',label,expected,sqlerrm; end if; raise notice 'PASS %',label; return; end; raise exception '% unexpectedly succeeded',label; end $$;

insert into public.companies(id,name,slug,trial_status,trial_ends_at) values
 ('c1000000-0000-4000-8000-000000000001','Review A','review-a','trial',now()+interval '7 days'),
 ('c1000000-0000-4000-8000-000000000002','Review B','review-b','trial',now()+interval '7 days'),
 ('c1000000-0000-4000-8000-000000000003','Review Expired','review-expired','trial',now()-interval '1 day');
insert into auth.users(id,email) values
 ('c2000000-0000-4000-8000-000000000001','review-a@example.invalid'),
 ('c2000000-0000-4000-8000-000000000002','review-b@example.invalid'),
 ('c2000000-0000-4000-8000-000000000003','review-expired@example.invalid');
update public.profiles set company_id='c1000000-0000-4000-8000-000000000001' where id='c2000000-0000-4000-8000-000000000001';
update public.profiles set company_id='c1000000-0000-4000-8000-000000000002' where id='c2000000-0000-4000-8000-000000000002';
update public.profiles set company_id='c1000000-0000-4000-8000-000000000003' where id='c2000000-0000-4000-8000-000000000003';
insert into public.user_roles(user_id,company_id,role) values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','member'),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','member'),
 ('c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','member');
insert into public.estimates(id,company_id,source,source_type,created_by,imported_by,title,status,total,charge_amount,schema_version) values
 ('c7000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Review','needs_answers',100,100,'estimate-photo-v1'),
 ('c7000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','photo_ai','photo_ai','c2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','Other','needs_answers',100,100,'estimate-photo-v1'),
 ('c7000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','photo_ai','photo_ai','c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000003','Expired','needs_answers',100,100,'estimate-photo-v1');
insert into public.estimate_items(id,estimate_id,company_id,description,quantity,unit,unit_price,total,position,item_type,description_original,description_normalized,planned_cost,client_price,extraction_status,provenance) values
 ('c8000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Labor',1,'job',100,100,1,'labor','Labr','Labor',120,100,'inferred','observed'),
 ('c8000000-0000-4000-8000-000000000002','c7000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Unclear',1,'job',0,0,2,'scope','Unclear','Unclear',null,0,'uncertain','observed');

set local role authenticated;
set local request.jwt.claims='{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select * from public.initialize_estimate_review_questions('c7000000-0000-4000-8000-000000000001','[{"ordinal":1,"category":"scope","question":"Scope?","reason":"scope"},{"ordinal":2,"category":"hidden_cost","question":"Costs?","reason":"cost"},{"ordinal":3,"category":"profitability","question":"Margin?","reason":"margin"}]');
select pg_temp.assert_true('Exactly three categories',(select count(*)=3 and count(distinct category)=3 and min(ordinal)=1 and max(ordinal)=3 from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001'));
select * from public.initialize_estimate_review_questions('c7000000-0000-4000-8000-000000000001','[{"ordinal":1,"category":"scope","question":"Scope?","reason":"scope"},{"ordinal":2,"category":"hidden_cost","question":"Costs?","reason":"cost"},{"ordinal":3,"category":"profitability","question":"Margin?","reason":"margin"}]');
select pg_temp.assert_true('Retry creates no duplicate questions',(select count(*)=3 from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001'));
select pg_temp.assert_forbidden('Never two questions',$sql$select public.initialize_estimate_review_questions('c7000000-0000-4000-8000-000000000001','[{"ordinal":1,"category":"scope","question":"a","reason":"a"},{"ordinal":2,"category":"hidden_cost","question":"b","reason":"b"}]')$sql$,'invalid_review_questions');
select pg_temp.assert_forbidden('Never four questions',$sql$select public.initialize_estimate_review_questions('c7000000-0000-4000-8000-000000000001','[{"ordinal":1,"category":"scope","question":"a","reason":"a"},{"ordinal":2,"category":"hidden_cost","question":"b","reason":"b"},{"ordinal":3,"category":"profitability","question":"c","reason":"c"},{"ordinal":3,"category":"profitability","question":"d","reason":"d"}]')$sql$,'invalid_review_questions');
select public.answer_estimate_review_question((select id from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001' and ordinal=1),'Sí');
select pg_temp.assert_true('Answer derives actor and timestamp',exists(select 1 from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001' and ordinal=1 and answered_by='c2000000-0000-4000-8000-000000000001' and answered_at is not null));
select public.answer_estimate_review_question((select id from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001' and ordinal=2),'Sí');
select public.answer_estimate_review_question((select id from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001' and ordinal=3),'Sí');
select pg_temp.assert_forbidden('Atomic rollback on invalid answer',$sql$select public.save_estimate_human_review('c7000000-0000-4000-8000-000000000001','Must rollback',200,'[{"id":"c8000000-0000-4000-8000-000000000001","description":"Must rollback","quantity":"9","unit":"hr","client_price":"200","planned_cost":"120","item_type":"labor"}]','[{"id":"00000000-0000-4000-8000-000000000000","answer":"bad"},{"id":"00000000-0000-4000-8000-000000000001","answer":"bad"},{"id":"00000000-0000-4000-8000-000000000002","answer":"bad"}]')$sql$,'review_answer_forbidden');
select pg_temp.assert_true('Failed save leaves no partial corrections',exists(select 1 from public.estimates where id='c7000000-0000-4000-8000-000000000001' and title='Review' and charge_amount=100) and exists(select 1 from public.estimate_items where id='c8000000-0000-4000-8000-000000000001' and description_normalized='Labor' and quantity=1));
select public.save_estimate_human_review('c7000000-0000-4000-8000-000000000001','Corrected',100,'[{"id":"c8000000-0000-4000-8000-000000000001","description":"Labor corrected","quantity":"2","unit":"hr","client_price":"100","planned_cost":"120","item_type":"labor"},{"id":"c8000000-0000-4000-8000-000000000002","description":"Unclear","quantity":"1","unit":"job","client_price":"0","planned_cost":null,"item_type":"scope"}]',(select jsonb_agg(jsonb_build_object('id',id,'answer',coalesce(answer,'Sí'))) from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001'));
select pg_temp.assert_true('Human edit preserves original and marks correction',exists(select 1 from public.estimate_items where id='c8000000-0000-4000-8000-000000000001' and description_original='Labr' and source_text is null and description_normalized='Labor corrected' and quantity=2 and planned_cost=120 and human_corrected and corrected_by='c2000000-0000-4000-8000-000000000001'));
select pg_temp.assert_true('Unchanged uncertain item stays uncertain',exists(select 1 from public.estimate_items where id='c8000000-0000-4000-8000-000000000002' and extraction_status='uncertain' and not human_corrected and corrected_by is null));

set local request.jwt.claims='{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_forbidden('Cross tenant answer blocked',$sql$select public.answer_estimate_review_question((select id from public.estimate_questions where estimate_id='c7000000-0000-4000-8000-000000000001' limit 1),'No')$sql$,'question_answer_forbidden');
set local request.jwt.claims='{"sub":"c2000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.assert_forbidden('Expired trial blocked',$sql$select public.initialize_estimate_review_questions('c7000000-0000-4000-8000-000000000003','[{"ordinal":1,"category":"scope","question":"a","reason":"a"},{"ordinal":2,"category":"hidden_cost","question":"b","reason":"b"},{"ordinal":3,"category":"profitability","question":"c","reason":"c"}]')$sql$,'trial_expired');
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"c2000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.estimates set status='approved',approved_by='c2000000-0000-4000-8000-000000000001',approved_at=now() where id='c7000000-0000-4000-8000-000000000001';
select pg_temp.assert_forbidden('Approved estimate edit blocked',$sql$select public.save_estimate_human_review('c7000000-0000-4000-8000-000000000001','No',100,'[]','[]')$sql$,'estimate_review_forbidden');
reset role;
select pg_temp.assert_true('Zero financial side effects',(select count(*)=0 from public.expenses where company_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003')) and (select count(*)=0 from public.payments where company_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003')) and (select count(*)=0 from public.worker_checkins where company_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003')) and (select count(*)=0 from public.project_financial_ledger where company_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003')));
rollback;
