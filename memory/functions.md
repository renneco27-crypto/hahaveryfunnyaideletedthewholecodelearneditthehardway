# Memory

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
│   └── 20260730_create_form_drafts.sql    — Drafts table (Save/Resume)
├── memory/
│   └── functions.md
├── ormoc_city_division_schools.json
├── package.json
├── AGENTS.md
└── README.md
```

### supabase/migrations/20260730_create_form_drafts.sql

Keywords: drafts table, save resume

Function Names: N/A (DDL)

Description: Creates `form_drafts` table for storing incomplete form state with columns `id`, `reference_number`, `school_name`, `school_id`, `report_data` (jsonb), `status`, `created_at`, `updated_at`. Indexed by `school_name`, `status`, `created_at`.

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

### htmls/school_dashboard_access_management_analytics.html

Keywords: analytics, draft rows, school filter, auth fix, renderHistory, annexLabel

Function Names: loadAnalytics, renderHistory, annexLabel, getIncidentCount

Description: loadAnalytics now uses window.__token for auth instead of ignored schoolName param. Fetches both /api/stats and /api/drafts, merges and sorts results. renderHistory fixed to read from correct DB fields (r.report_data?.metadata?.reportingYear, r.status, r.module). Draft rows show "Continue" button linking to /submissions?draft=REF. getIncidentCount handles Module D's ciclList format. School name header displayed in subtitle.
