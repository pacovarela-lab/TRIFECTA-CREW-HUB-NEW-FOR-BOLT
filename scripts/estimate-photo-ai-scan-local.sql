\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_true(label text, actual boolean) returns void
language plpgsql as $$ begin if actual is not true then raise exception '%: expected true',label; end if; raise notice 'PASS %',label; end $$;
create or replace function pg_temp.assert_forbidden(label text, statement text, expected text) returns void
language plpgsql security invoker as $$ begin
  begin execute statement; exception when others then
    if position(lower(expected) in lower(sqlerrm))=0 then raise exception '%: expected %, got %',label,expected,sqlerrm; end if;
    raise notice 'PASS % (%)',label,sqlerrm; return;
  end;
  raise exception '%: unexpectedly succeeded',label;
end $$;

insert into public.companies(id,name,slug,trial_status,trial_ends_at) values
 ('b1000000-0000-4000-8000-000000000001','AI Scan Active','ai-scan-active','trial',now()+interval '7 days'),
 ('b1000000-0000-4000-8000-000000000002','AI Scan Expired','ai-scan-expired','trial',now()-interval '1 day');
insert into auth.users(id,email) values
 ('b2000000-0000-4000-8000-000000000001','ai-scan@example.invalid'),
 ('b2000000-0000-4000-8000-000000000002','ai-scan-expired@example.invalid');
update public.profiles set company_id='b1000000-0000-4000-8000-000000000001' where id='b2000000-0000-4000-8000-000000000001';
update public.profiles set company_id='b1000000-0000-4000-8000-000000000002' where id='b2000000-0000-4000-8000-000000000002';
insert into public.user_roles(user_id,company_id,role) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','member'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','member');
insert into public.estimates(id,company_id,source,source_type,created_by,imported_by,title,status,total,schema_version) values
 ('b7000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','photo_ai','photo_ai','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Photo','analyzing',0,'estimate-photo-v1'),
 ('b7000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','photo_ai','photo_ai','b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','Expired','analyzing',0,'estimate-photo-v1');
insert into public.estimate_images(id,company_id,estimate_id,storage_path,page_number,sha256,mime_type,byte_size,created_by) values
 ('bd000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001/bd000000-0000-4000-8000-000000000001.jpg',1,repeat('a',64),'image/jpeg',100,'b2000000-0000-4000-8000-000000000001'),
 ('bd000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002/b7000000-0000-4000-8000-000000000002/bd000000-0000-4000-8000-000000000002.jpg',1,repeat('b',64),'image/jpeg',100,'b2000000-0000-4000-8000-000000000002');
insert into public.estimate_analysis_runs(id,company_id,estimate_id,request_key,image_set_hash,stage,status,schema_version,attempts,created_by,started_at) values
 ('bc000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','ai-scan-request-0001',repeat('a',64),'extraction','running','estimate-photo-v1',1,'b2000000-0000-4000-8000-000000000001',now()),
 ('bc000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000002','ai-scan-request-0002',repeat('b',64),'extraction','running','estimate-photo-v1',1,'b2000000-0000-4000-8000-000000000002',now());

set local role authenticated;
set local request.jwt.claims='{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.assert_forbidden('Extraction-only persistence rejects recommendation provenance',$sql$
 select public.persist_estimate_photo_extraction('bc000000-0000-4000-8000-000000000001','{"schema_version":"estimate-photo-v1","currency_code":"USD","fields":[{"key":"title","source_text":"x","normalized_text":"x","value":"x","confidence":1,"status":"confirmed","reason":null,"provenance":"recommended","image_index":1}],"items":[],"uncertainties":[],"warnings":[]}'::jsonb,'model',1)
$sql$,'invalid_extraction');
select pg_temp.assert_forbidden('Persistence rejects image index outside the actual ordered set',$sql$
 select public.persist_estimate_photo_extraction('bc000000-0000-4000-8000-000000000001','{"schema_version":"estimate-photo-v1","currency_code":"USD","fields":[{"key":"title","source_text":"x","normalized_text":"x","value":"x","confidence":1,"status":"confirmed","reason":null,"provenance":"observed","image_index":2}],"items":[],"uncertainties":[],"warnings":[]}'::jsonb,'model',1)
$sql$,'invalid_extraction');
select public.persist_estimate_photo_extraction(
 'bc000000-0000-4000-8000-000000000001',
 '{"schema_version":"estimate-photo-v1","currency_code":"USD","fields":[{"key":"title","source_text":"Roof repair","normalized_text":"Roof repair","value":"Roof repair","confidence":0.9,"status":"confirmed","reason":null,"provenance":"observed","image_index":1},{"key":"charge_amount","source_text":"$1,250","normalized_text":"1250","value":"1250.00","confidence":0.8,"status":"confirmed","reason":null,"provenance":"observed","image_index":1}],"items":[{"description_original":"Labor","description_normalized":"Roof labor","quantity":"2","unit":"hr","client_price":"1250.00","planned_cost":"900.00","item_type":"labor","confidence":0.8,"extraction_status":"confirmed","provenance":"observed","source_text":"Labor 2 hr 1250","source_image_index":1}],"uncertainties":[],"warnings":[]}'::jsonb,
 'google/gemini-2.5-flash',1
);
select pg_temp.assert_true('AI Scan persists draft result with client-charge semantics',exists(
 select 1 from public.estimates where id='b7000000-0000-4000-8000-000000000001' and status='needs_answers' and total=1250 and charge_amount=1250
));
select pg_temp.assert_true('AI Scan keeps planned cost separate from client price',exists(
 select 1 from public.estimate_items where estimate_id='b7000000-0000-4000-8000-000000000001' and total=1250 and client_price=1250 and planned_cost=900
));
select pg_temp.assert_true('AI Scan marks the logical run succeeded once',exists(
 select 1 from public.estimate_analysis_runs where id='bc000000-0000-4000-8000-000000000001' and status='succeeded' and completed_at is not null
));
select pg_temp.assert_forbidden('Successful run cannot persist duplicate items',$sql$
 select public.persist_estimate_photo_extraction('bc000000-0000-4000-8000-000000000001','{"schema_version":"estimate-photo-v1","currency_code":"USD","fields":[],"items":[]}'::jsonb,'model',1)
$sql$,'analysis_run_forbidden');
select pg_temp.assert_true('Retry creates no duplicate items',(select count(*)=1 from public.estimate_items where estimate_id='b7000000-0000-4000-8000-000000000001'));

set local request.jwt.claims='{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_forbidden('Expired trial cannot persist AI Scan',$sql$
 select public.persist_estimate_photo_extraction('bc000000-0000-4000-8000-000000000002','{"schema_version":"estimate-photo-v1","currency_code":"USD","fields":[],"items":[]}'::jsonb,'model',1)
$sql$,'trial_expired');

reset role;
select pg_temp.assert_true('AI Scan creates no financial side effects',
 (select count(*)=0 from public.expenses where company_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'))
 and (select count(*)=0 from public.payments where company_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'))
 and (select count(*)=0 from public.worker_checkins where company_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'))
 and (select count(*)=0 from public.project_financial_ledger where company_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'))
);
rollback;
