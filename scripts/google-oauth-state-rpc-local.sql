\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_true(label text, actual boolean) returns void
language plpgsql as $$ begin
  if actual is not true then raise exception '%: expected true', label; end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.assert_false(label text, actual boolean) returns void
language plpgsql as $$ begin
  if actual is not false then raise exception '%: expected false', label; end if;
  raise notice 'PASS %', label;
end $$;

create or replace function pg_temp.assert_error(label text, statement text, expected text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlerrm = expected then
      raise notice 'PASS %', label;
      return;
    end if;
    raise exception '%: expected %, got %', label, expected, sqlerrm;
  end;
  raise exception '%: operation unexpectedly succeeded', label;
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

select pg_temp.assert_false(
  'anon cannot execute create RPC',
  has_function_privilege('anon', 'public.create_google_oauth_state(text,uuid,uuid,text,text,timestamptz)', 'EXECUTE')
);
select pg_temp.assert_false(
  'authenticated cannot execute create RPC',
  has_function_privilege('authenticated', 'public.create_google_oauth_state(text,uuid,uuid,text,text,timestamptz)', 'EXECUTE')
);
select pg_temp.assert_false(
  'anon cannot execute consume RPC',
  has_function_privilege('anon', 'public.consume_google_oauth_state(text)', 'EXECUTE')
);
select pg_temp.assert_false(
  'authenticated cannot execute consume RPC',
  has_function_privilege('authenticated', 'public.consume_google_oauth_state(text)', 'EXECUTE')
);
select pg_temp.assert_true(
  'service_role can execute create RPC',
  has_function_privilege('service_role', 'public.create_google_oauth_state(text,uuid,uuid,text,text,timestamptz)', 'EXECUTE')
);
select pg_temp.assert_true(
  'service_role can execute consume RPC',
  has_function_privilege('service_role', 'public.consume_google_oauth_state(text)', 'EXECUTE')
);
select pg_temp.assert_false(
  'service_role has no direct private schema access',
  has_schema_privilege('service_role', 'private', 'USAGE')
);

insert into auth.users(id,email) values
  ('a1000000-0000-0000-0000-000000000001','oauth-rpc-sql@local.invalid');
insert into public.companies(id,name,slug) values
  ('b1000000-0000-0000-0000-000000000001','OAuth RPC SQL','oauth-rpc-sql');

insert into private.google_oauth_states(
  state_hash,user_id,company_id,encrypted_code_verifier,redirect_uri,expires_at
) values (
  repeat('e',43),'a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
  'encrypted-expired','https://example.invalid/callback',clock_timestamp() - interval '1 minute'
);

set local role anon;
select pg_temp.assert_forbidden(
  'anon execution is denied',
  $sql$select public.consume_google_oauth_state(repeat('n',43))$sql$
);

set local role authenticated;
select pg_temp.assert_forbidden(
  'authenticated execution is denied',
  $sql$select public.consume_google_oauth_state(repeat('n',43))$sql$
);

set local role service_role;
select pg_temp.assert_forbidden(
  'service_role cannot read private table directly',
  $sql$select state_hash from private.google_oauth_states limit 0$sql$
);

select public.create_google_oauth_state(
  repeat('v',43),
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'encrypted-valid',
  'https://example.invalid/callback',
  clock_timestamp() + interval '10 minutes'
);

select pg_temp.assert_true(
  'valid state is consumed once',
  exists(select 1 from public.consume_google_oauth_state(repeat('v',43)))
);
select pg_temp.assert_error(
  'second consumption is rejected',
  $sql$select public.consume_google_oauth_state(repeat('v',43))$sql$,
  'oauth_state_already_used'
);
select pg_temp.assert_error(
  'expired state is rejected',
  $sql$select public.consume_google_oauth_state(repeat('e',43))$sql$,
  'oauth_state_expired'
);
select pg_temp.assert_error(
  'missing state is rejected',
  $sql$select public.consume_google_oauth_state(repeat('m',43))$sql$,
  'oauth_state_not_found'
);

reset role;
rollback;
