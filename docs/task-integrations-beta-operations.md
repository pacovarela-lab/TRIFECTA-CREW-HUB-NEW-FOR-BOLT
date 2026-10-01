# Task integrations beta: administrative setup

Keep the five company feature flags disabled until the corresponding integration has passed a staging smoke test. Never place these values in `VITE_*`, source control, a PR, or support chat.

## Supabase Edge Function secrets

Add secrets in the production project (`jeju…uozb`) under **Edge Functions → Secrets** (or by an authorized administrator using `supabase secrets set`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_CALLBACK_URL` — exact deployed callback URL ending in `/functions/v1/google-calendar-connect-callback`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — 32 random bytes encoded as unpadded base64url
- `GOOGLE_OAUTH_STATE_SECRET` — independent high-entropy HMAC secret
- `APP_URL` — canonical frontend origin
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN` (or adapt the worker to an approved API key before use)
- `TWILIO_VERIFY_SERVICE_SID`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_STATUS_CALLBACK_URL` — exact public callback URL used by Twilio signature validation
- `SCHEDULER_SECRET` — independent random secret used only between Cron and the two workers

Add the same scheduler values to Supabase Vault as `task_worker_project_url` and `task_worker_scheduler_secret`. The Cron job runs every five minutes and exits without making a request while either Vault value is absent.

## Google Cloud

Create an OAuth consent screen and a **Web application** OAuth client. Register the callback URI exactly. The requested scopes are only `openid`, `email`, Calendar List read-only, and Calendar Events. If the consent screen remains in Testing, add explicit test users; otherwise complete Google's publication/verification requirements applicable to these scopes. The Google account may differ from the Trifecta login account.

## Twilio

Configure a Verify Service, a Messaging Service with a compatible sender, the delivery-status callback, and any country-specific registration. Trial accounts can message only permitted/verified destination numbers. Do not enable `sms_enabled` until a real assignment, reminder, reschedule/cancel, and delivery callback pass in staging.

## Safe activation order

1. Apply migrations in an isolated staging project.
2. Deploy only the affected functions.
3. Add secrets and Vault scheduler values.
4. Test one identified staging user in each tenant and verify cross-tenant denials.
5. Enable company flags one at a time.
6. Keep production flags off until human review and a rollback plan are complete.
