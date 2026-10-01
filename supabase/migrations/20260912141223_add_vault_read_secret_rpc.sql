/*
# Add vault_read_secret RPC function

1. New Functions
- `vault_read_secret(secret_name text)` — SECURITY DEFINER function that reads a
  secret from the vault by name and returns its value as text.
  Only callable by the service_role (authenticated check via current_setting).

2. Security
- SECURITY DEFINER so it can access the vault schema.
- Checks that the caller is using the service_role key.
*/

CREATE OR REPLACE FUNCTION vault_read_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_value text;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN secret_value;
END;
$$;

REVOKE ALL ON FUNCTION vault_read_secret(text) FROM PUBLIC, anon, authenticated;
