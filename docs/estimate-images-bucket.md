# Storage bucket `estimate-images` — operational note

## Where this backend lives

- Lovable project: `4d3ed737-8d94-4f6f-8e17-445168466453`
- Production backend (Lovable Cloud): `jejuyjesfhwkzfgfuozb`
- This backend is **not** a standard Supabase project owned by a personal organization, so it
  **does not appear in dashboard.supabase.com**. All administration happens in **Lovable → Backend**
  (see `docs/LOVABLE_CLOUD_BACKEND_RUNBOOK.md`).
- `ufzqonxjgmwyutljhbfw` is a **separate personal Supabase project that does not belong to Crew Hub**.
  Never link, query, migrate to, or reference it.

## Why the bucket allowlist is enforced in RLS, not on the bucket

`supabase/migrations/20260828120000_estimate_photo_foundation.sql` creates the bucket with
`allowed_mime_types`, which works on a local `supabase db reset`. The managed channel used for
production **rejects every DML against `storage.buckets`**, and the Storage admin tool exposes only
`public` and `file_size_limit`. The production bucket was therefore created out-of-band and
`storage.buckets.allowed_mime_types` stayed `NULL`; it is **not configurable** from the managed
channel. The applied migrations were not edited retroactively.

The gap this left (an object with an image extension but a spoofed `Content-Type` could land in
Storage) is now closed by a corrective migration that enforces the same allowlist inside the
`storage.objects` INSERT/UPDATE policies, reading `metadata->>'mimetype'` server-side.

## Production state (`jejuyjesfhwkzfgfuozb`)

| Property | Value |
| --- | --- |
| `id` / `name` | `estimate-images` |
| `public` | `false` |
| `file_size_limit` | `10485760` (10 MB) |
| `allowed_mime_types` | `NULL` — not settable; enforced by RLS instead |

## MIME allowlist (must match in every layer)

```
image/jpeg, image/jpg, image/png, image/webp, image/heic, image/heif
```

Enforced in four places, all identical:

1. **Application** — `ESTIMATE_PHOTO_MIMES` in `src/lib/estimatePhotoScan.ts` (browser accepts
   jpeg/jpg/png/webp; HEIC/HEIF are accepted as *input* and converted by
   `src/lib/imagePrep.ts` before upload) and the extension union in
   `src/lib/estimatePhotoFoundation.ts`.
2. **DB constraints** — `estimate_images_mime_check` and `estimate_images_storage_path_shape`.
3. **Storage RLS** — the `estimate-images` INSERT/UPDATE policies (extension regex + MIME allowlist).
4. **Edge Function** — `estimate-photo-analyze` only reads rows from `public.estimate_images`, which
   already satisfy the DB constraint.

**HEIC/HEIF behaviour:** the *input* file may be HEIC/HEIF; the browser converts it to JPEG, so the
**stored object is normally `image/jpeg`**. HEIC/HEIF remain in the allowlist so a direct
HEIC upload (non-browser client, or a browser path that skips conversion) is still valid.

## Effective storage protections

INSERT/UPDATE on `estimate-images` require **all** of:

- `bucket_id = 'estimate-images'`
- path shape `company_id/estimate_id/image_id.ext` with `ext ∈ jpg|jpeg|png|webp|heic|heif`
- first path segment equals `public.current_company_id()` (same-company / tenant isolation)
- the estimate exists in that company (membership)
- `estimate.status <> 'approved'` (approved estimates are immutable)
- `public.company_writes_allowed(company_id)` (trial write gate)
- `public.can_manage_estimate(...)` (Foundation permissions)
- `lower(metadata->>'mimetype')` in the allowlist (blocks spoofed and empty MIME)

SELECT and DELETE policies were **not** changed by the corrective migration. Signed URLs are
unchanged (TTL 60 s). Size is enforced by the bucket limit (10 MB → HTTP 4xx/413 on excess).

## How to verify the bucket / policies

From **Lovable → Backend**:

- Storage → `estimate-images` → confirm it is private and the size limit is 10 MB.
- Database → SQL: `select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname ilike 'estimate images%';`
- Database → SQL: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='estimate-images';`

Do **not** attempt `insert`/`update` on `storage.buckets` — the managed channel rejects it.

## Deploying / updating Edge Functions

Edge Functions live in `supabase/functions/`. For this module only
`estimate-photo-analyze` is relevant. Deploy from the Lovable agent
(`deploy_edge_functions`) or Lovable → Backend → Functions. Never deploy unrelated functions in a
scoped change, and never print secrets.
