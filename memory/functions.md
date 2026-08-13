# Memory

## Session Summary (2026-07-30)

All changes in commit messages: "fixed annex a-e", "remove dashboard route...", "move auth token...", "restore sidebar..."

### What was done

1. **Date inputs** — Fixed partial date preservation using `::y:...|m:...|d:...` encoding so users can fill month/day/year incrementally.

2. **Submit button** — Green flash animation + success badge → POST → redirect to /analytics at 800ms.

3. **401 on `/api/stats`** — Fixed by adding `Authorization: Bearer <token>` header (moved from query param). All endpoints now use `getToken(req)` helper that reads header first, falls back to query param. CORS configured to allow `Authorization` header.

4. **Deleted test records** — 6 test rows removed from `bullying_reports` Supabase table.

5. **Module → Annex relabeling** — Buttons changed from "Module A/B/C/D/E" to "Annex A/B/C/D/E". Annex titles use full formal names (e.g. "Annex A — School-Based Incident Report on Bullying").

6. **Annex D redesign** — Removed per-category D-1–D-6 pills. Replaced with CICL table (LRN, Age, Gender, Disability, Case/Violation, Actions, Status) + Section B intervention narrative + summary counters. School Year moved into School Information card.

7. **Save Draft + Resume** — Save Draft button now collects all module state and POSTs to `/api/drafts`. On page load checks `?draft=REF` to resume. After submit, draft is auto-deleted. Requires new `form_drafts` Supabase table (migration created).

8. **Reports page** — Annex D detail view renders CICL table properly. `annexLabel()` uses full titles. Badges show "Annex A"–"Annex E". Filter uses "Annex: All" with correct annex options.

9. **Analytics page** — Fixed field references (`report_data.metadata.reportingYear`, `r.status`, `r.module`). Fetches both stats and drafts, merges and displays. Draft rows show "Continue" button. School name header in subtitle.

10. **Auth token in header** — All fetch calls moved from `?token=` query param to `Authorization: Bearer <token>` header. `sendBeacon` replaced with `fetch` + `keepalive`.

11. **Sidebar restored** — Re-added after user request. Non-admin Overview link REMOVED (only Submissions + Access Management remain). Admin Overview stays at `/admin`.

12. **`/dashboard` route REMOVED** — Login redirects to `/analytics`. Auth-guard non-admin redirects to `/analytics`. Do NOT re-add.

## Session Summary (2026-08-13, PM)

### What was done

1. **`.env` created** — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role key, project `nstyqceyjkgevnibfqks`, verified working against `/rest/v1/profiles`). `.env` is gitignored; never commit it.

2. **`.opencode/plugins/supabase.ts` created** — opencode plugin exposing two tools:
   - `supabase_table` — read/write/delete rows via PostgREST `GET/PATCH/POST/DELETE` (supports `select` projection, exact-match `filters`, `limit`, `order`; DELETE only on delete columns).
   - `supabase_sql` — execute raw SQL (including DDL) against `https://api.supabase.com/v1/projects/{ref}/database/query`.
   - Loads credentials from `.env`. Verified loads with Node 24 native TS; both tools registered.

3. **Migration attempt (20260813_create_build_logs.sql)** — created file only; could NOT be applied:
   - Service role key rejected by Management API `/database/query` (401 `JWT failed verification`).
   - The Management API requires a `sbp_...` access token or DB password/connection string.
   - `create_build_logs.sql` still needs to be run in the Supabase Dashboard SQL Editor (or with an `sbp_` token), else `build_logs` table will not exist.

## Repository Map

```
C:.
├── htmls/
│   ├── annex_modules_redesigned.html      — Main submission form (React, all modules A-E)
│   ├── latest_excel_division_consolidated_reports.html — Reports page
│   ├── school_dashboard_access_management_analytics.html — Analytics page
│   ├── auth-guard.js                      — Auth setup, sets window.__user, window.__token
│   ├── sidebar.js                         — Sidebar navigation
│   ├── access_pending_approval.html
│   ├── access_management_wired.html
│   ├── auth-callback.html
│   ├── login_ormoc_city_division_lrp_wired_1.html
│   ├── admin_overview_wired.html
│   ├── populate_dashboard.js
│   ├── school_dashboard_review_annex_a_report.html
│   └── styles.css
├── server.js                              — Express server, API endpoints
├── supabase/migrations/
│   ├── 20260728_create_bullying_reports.sql
│   ├── 20260728_add_school_name_to_profiles.sql
│   ├── 20260728_cleanup_old_reports.sql
│   ├── oauth_sudo_and_user.sql
│   ├── 20260730_create_form_drafts.sql    — Drafts table (Save/Resume)
│   └── 20260813_create_registered_ips.sql — IP limit table (3 IPs per non-admin)
├── memory/
│   └── functions.md
├── ormoc_city_division_schools.json
├── package.json
├── AGENTS.md
├── README.md
└── .opencode/
    └── plugins/
        └── supabase.ts — supabase_table (CRUD via PostgREST), supabase_sql (raw SQL/DDL via Management API)
```

### .opencode/plugins/supabase.ts

Keywords: supabase plugin, postgrest, table crud, raw sql, env creds

Function Names: supabase_table, supabase_sql

Description: opencode plugin reading SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY from .env. `supabase_table` performs PostgREST CRUD (select/filters/order/limit, insert, bulk upsert, update, delete). `supabase_sql` runs raw SQL against the Supabase Management API `database/query` endpoint (requires `sbp_` token — service role key alone is rejected).

### supabase/migrations/20260730_create_form_drafts.sql

Keywords: drafts table, save resume

Function Names: N/A (DDL)

Description: Creates `form_drafts` table for storing incomplete form state with columns `id`, `reference_number`, `school_name`, `school_id`, `report_data` (jsonb), `status`, `created_at`, `updated_at`. Indexed by `school_name`, `status`, `created_at`.

### supabase/migrations/20260813_create_registered_ips.sql

Keywords: ip limit, registered ips, access approval

Function Names: N/A (DDL)

Description: Creates `registered_ips` table (email, ip_address, unique per email+ip) for enforcing the 3 IP address limit per non-admin account. IPs persist in Supabase and are cleared on `/api/access-requests/:email/approve`.

### server.js

Keywords: admin login redirect, 3 IP limit, verify-session, ip_limit, getClientIp

Function Names: getClientIp, POST /api/verify-session, POST /api/access-requests/:email/approve

Description: Fixed auth-guard bug (no session → /login instead of /pending). Replaced in-memory `activeSessions` token tracking with `registered_ips` Supabase table. verify-session extracts client IP via `x-forwarded-for`/socket, admins bypass the limit entirely, non-admins get 3 registered IPs before `{ valid:false, reason:'ip_limit' }` and a pending-queue entry. Approve clears the email's IP history.

### server.js

Keywords: draft API, save draft, list drafts, load draft, delete draft

Function Names: POST /api/drafts, GET /api/drafts, GET /api/drafts/:ref, DELETE /api/drafts/:ref

Description: Four draft endpoints. POST saves or updates a draft (upserts by reference_number). GET lists all Draft-status records filtered by user's school. GET /:ref loads a single draft by reference number. DELETE /:ref removes a draft.

### htmls/annex_modules_redesigned.html

Keywords: save draft, resume draft, handleSaveDraft, draftRef

Function Names: handleSaveDraft, draftRef state, draft resume in useEffect

Description: Save Draft button collects all module states (A-E) and POSTs to /api/drafts. On page load checks ?draft=REF query param to load and populate all form fields. After confirmSubmit, deletes the draft via sendBeacon.

### htmls/latest_excel_division_consolidated_reports.html

Keywords: Annex D detail, CICL table, annex naming, incident count

Function Names: showReportDetail, goReportsPage, annexLabel, categoryBadge

Description: showReportDetail now renders Module D with CICL summary header + table + intervention narrative. goReportsPage counts ciclList.length for module D instead of category keys. annexLabel uses full titles (e.g. "Annex A — School-Based Incident Report on Bullying"). categoryBadge shows "Annex A" through "Annex E". Filter uses "Annex: All" with "Annex A"-"Annex E" options.

## DELETED / REMOVED (DO NOT RESTORE)

### `/dashboard` route (server.js)
- **DELETED** — removed from protectedPages array. Do not re-add.
- Login redirect now goes to `/analytics` instead (`login_ormoc_city_division_lrp_wired_1.html:228`)
- Auth-guard non-admin redirect goes to `/analytics` instead (`auth-guard.js:53`)

### Overview sidebar link (sidebar.js:24)
- **DELETED** for non-admin users. Admin Overview still exists at `/admin`.
- Non-admin sidebar only has: Submissions, Access Management.

### `school_dashboard_access_management_analytics.html`

Keywords: analytics, draft rows, school filter, auth fix, renderHistory, annexLabel

Function Names: loadAnalytics, renderHistory, annexLabel, getIncidentCount

Description: loadAnalytics now uses window.__token for auth instead of ignored schoolName param. Fetches both /api/stats and /api/drafts, merges and sorts results. renderHistory fixed to read from correct DB fields (r.report_data?.metadata?.reportingYear, r.status, r.module). Draft rows show "Continue" button linking to /submissions?draft=REF. getIncidentCount handles Module D's ciclList format. School name header displayed in subtitle.
