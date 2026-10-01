# Crew Hub — Lovable Cloud backend runbook

| Item | Value |
| --- | --- |
| Lovable project | `4d3ed737-8d94-4f6f-8e17-445168466453` |
| Production backend (Lovable Cloud) | `jejuyjesfhwkzfgfuozb` |
| Administration surface | **Lovable → Backend** |
| Supabase dashboard | Not applicable — this backend is managed by Lovable and does not appear in `dashboard.supabase.com` |

The backend is provisioned and owned by Lovable Cloud. It is a real Postgres/Supabase stack, but it
is not a project inside a personal Supabase organization, which is why a GitHub-authenticated
Supabase account cannot see it. Ownership transfer is **not** performed by the agent; if it is ever
needed, it goes through Lovable Support and must preserve project ref, URL, keys and data.

## Where to do what

| Task | Where |
| --- | --- |
| Inspect tables / rows | Lovable → Backend → Database (Tables) |
| Run SQL, apply migrations | Lovable → Backend → Database (SQL) or the agent's migration tool. Migration files land in `supabase/migrations/` |
| Review / change RLS policies | Lovable → Backend → Database → Policies (changes must go through a migration) |
| Storage buckets and objects | Lovable → Backend → Storage. `public` and `file_size_limit` are editable; `allowed_mime_types` is **not** settable from the managed channel (see `docs/estimate-images-bucket.md`) |
| Edge Functions (deploy, logs) | Lovable → Backend → Functions |
| Logs (DB, API, functions, auth) | Lovable → Backend → Logs |
| Auth providers and users | Lovable → Backend → Auth / Users |
| Secrets and config | Lovable → Backend → Secrets. Never print, echo, or commit secret values |

## Operating rules

- Only `jejuyjesfhwkzfgfuozb` is authorized for Crew Hub.
- Schema changes always go through a migration; never hand-edit migration history.
- Data fixes go through explicit, described SQL — never against financial tables during smokes
  (`expenses`, `payments`, `worker_checkins`, `project_financial_ledger`, V10 data).
- Frontend deploys are separate from backend changes and require explicit authorization.

## DO NOT USE

```
ufzqonxjgmwyutljhbfw
```

This is a **separate personal Supabase project** that does not belong to Crew Hub. Do not link it,
query it, migrate to or from it, reactivate it, or reference it in code, CI, or docs. In particular
never run `supabase link --project-ref ufzqonxjgmwyutljhbfw` or any equivalent.

## Supabase CLI

Crew Hub deployment and operation do **not** require a personal Supabase CLI to see
`jejuyjesfhwkzfgfuozb`. A CLI authenticated against a personal account will list only that
account's own projects; that has no bearing on Crew Hub and must not be used to relink the app.
