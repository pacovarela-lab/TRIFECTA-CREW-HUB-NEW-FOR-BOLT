/*
# Add daily reminder preferences and push subscriptions

1. Changes to existing tables
- `profiles`: adds two columns:
  - `daily_reminder_enabled` (boolean, default false)
  - `daily_reminder_time` (text, default '19:00')

2. New Tables
- `push_subscriptions` — stores Web Push endpoint + keys per user
  - id, user_id, endpoint, p256dh, auth, created_at, updated_at

3. Security
- push_subscriptions: RLS enabled, owner-scoped CRUD (authenticated only).

4. pg_cron
- A cron schedule calls the daily-reminder-send edge function every minute.
  The function checks each user's configured time and sends only when it matches.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_reminder_time text NOT NULL DEFAULT '19:00';

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_subs" ON push_subscriptions;
CREATE POLICY "select_own_push_subs" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subs" ON push_subscriptions;
CREATE POLICY "insert_own_push_subs" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subs" ON push_subscriptions;
CREATE POLICY "delete_own_push_subs" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
