-- Catalog evidence only. Run through an authorized read-only connection; do not
-- select secret values or export auth rows into Git. No writes or network calls.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT extname, extversion, n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY extname;

SELECT n.nspname AS schema_name, c.relname, c.relkind, c.relrowsecurity,
       c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner, c.reloptions,
       CASE WHEN c.relkind IN ('v', 'm') THEN md5(pg_get_viewdef(c.oid, true)) END AS view_definition_hash
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'private', 'auth', 'storage') AND c.relkind IN ('r','p','v','m','S')
ORDER BY n.nspname, c.relname;

SELECT n.nspname AS schema_name, c.relname, a.attname,
       format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, a.attidentity,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname IN ('public','private') AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;

SELECT conrelid::regclass::text AS relation, conname, contype,
       NULLIF(confrelid, 0)::regclass::text AS referenced_relation,
       condeferrable, condeferred, convalidated, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint WHERE connamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','private'))
ORDER BY relation, conname;

SELECT n.nspname AS schema_name, c.relname, t.tgname, t.tgenabled,
       t.tgfoid::regprocedure::text AS function, md5(pg_get_triggerdef(t.oid, true)) AS definition_hash
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public','private','auth','storage')
ORDER BY n.nspname, c.relname, t.tgname;

SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
       p.proacl, md5(pg_get_functiondef(p.oid)) AS definition_hash
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
ORDER BY n.nspname, p.proname, arguments;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('public','private','storage') ORDER BY schemaname, tablename, policyname;
SELECT table_schema, table_name, grantor, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants WHERE table_schema IN ('public','private','storage')
ORDER BY table_schema, table_name, grantee, privilege_type;
SELECT defaclrole::regrole::text AS owner, defaclnamespace::regnamespace::text AS schema_name, defaclobjtype, defaclacl
FROM pg_default_acl ORDER BY owner, schema_name, defaclobjtype;
SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname IN ('public','private') ORDER BY schemaname, tablename, indexname;
SELECT * FROM pg_sequences WHERE schemaname IN ('public','private') ORDER BY schemaname, sequencename;

SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT bucket_id, count(*)::text AS object_count FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id;
SELECT count(*)::text AS auth_users FROM auth.users;
SELECT provider, count(*)::text AS identity_count FROM auth.identities GROUP BY provider ORDER BY provider;

-- Return exact count-query candidates; execute only reviewed SELECTs in the same
-- snapshot using an authorized connection. No table data is exposed here.
SELECT format('SELECT %L AS relation, count(*)::text AS rows FROM %I.%I;', n.nspname || '.' || c.relname, n.nspname, c.relname) AS count_sql
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private') ORDER BY n.nspname, c.relname;

-- Check existence before querying optional managed schemas in a separate,
-- read-only transaction. Vault secret values must never be selected.
SELECT to_regclass('cron.job') AS cron_catalog,
       to_regclass('vault.secrets') AS vault_catalog,
       to_regclass('supabase_migrations.schema_migrations') AS migration_history;
COMMIT;
