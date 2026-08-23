# Graph Report - C:\Users\corte\Desktop\New folder (2)\hahaveryfunnyaideletedthewholecodelearneditthehardway  (2026-08-13)

## Corpus Check
- Corpus is ~37,836 words - fits in a single context window. You may not need a graph.

## Summary
- 169 nodes · 200 edges · 29 communities (23 shown, 6 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- LRP Frontend Screens & Auth
- Server Express Backend
- Package Metadata
- Runtime Dependencies
- Access Management
- Annex Form Submission Logic
- Annex A-E Modules
- OpenCode Plugin References
- Supabase Auth Migrations
- Dashboard Population Script
- Semantic Diff Plugin
- Semantic Chunk Plugin
- Smart Read Plugin
- Project Config Docs
- Admin Auth Helpers
- Sidebar Navigation
- Reports Cleanup Migration
- Bullying Reports Migration
- Form Drafts Migration
- Profiles Table

## God Nodes (most connected - your core abstractions)
1. `Annex A-E Submission Form` - 17 edges
2. `School Analytics Dashboard` - 10 edges
3. `auth-guard.js (shared auth setup)` - 8 edges
4. `GET /api/stats endpoint` - 8 edges
5. `Repository Memory Map (memory/functions.md)` - 7 edges
6. `Division Consolidated Reports Screen (admin)` - 7 edges
7. `Annex A Review Dashboard (school)` - 7 edges
8. `Draft API endpoints (/api/drafts)` - 7 edges
9. `annexLabel() (full annex titles)` - 7 edges
10. `Access Management Screen (admin)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Access Management Screen (admin)` --shares_data_with--> `auth-guard.js (shared auth setup)`  [INFERRED]
  htmls/access_management_wired.html → memory/functions.md
- `Access Management Screen (admin)` --shares_data_with--> `sidebar.js (shared sidebar navigation)`  [INFERRED]
  htmls/access_management_wired.html → memory/functions.md
- `handleSaveDraft()` --references--> `Draft API endpoints (/api/drafts)`  [EXTRACTED]
  htmls/annex_modules_redesigned.html → memory/functions.md
- `Kilo Project Instructions` --conceptually_related_to--> `AGENTS.md Agent Memory Directive`  [INFERRED]
  .kilo/commands/projects.md → AGENTS.md
- `AGENTS.md Agent Memory Directive` --references--> `Repository Memory Map (memory/functions.md)`  [EXTRACTED]
  AGENTS.md → memory/functions.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Annex A-E Report Modules** — htmls_annex_modules_redesigned_annex_a, htmls_annex_modules_redesigned_annex_b, htmls_annex_modules_redesigned_annex_c, htmls_annex_modules_redesigned_annex_d, htmls_annex_modules_redesigned_annex_e [EXTRACTED 1.00]
- **Device/Account Access Approval Flow** — htmls_login_ormoc_city_division_lrp_wired_1_login_ormoc_city_division_lrp_wired_1, htmls_auth_callback_auth_callback, htmls_access_pending_approval_access_pending_approval, htmls_access_management_wired_access_management_wired, htmls_access_management_wired_api_access_requests [INFERRED 0.85]
- **Report Submission to Analytics/Consolidation Data Flow** — htmls_annex_modules_redesigned_annex_modules_redesigned, htmls_annex_modules_redesigned_api_submit, memory_functions_api_stats, htmls_latest_excel_division_consolidated_reports_latest_excel_division_consolidated_reports, htmls_school_dashboard_access_management_analytics_school_dashboard_access_management_analytics [INFERRED 0.85]

## Communities (29 total, 6 thin omitted)

### Community 0 - "LRP Frontend Screens & Auth"
Cohesion: 0.15
Nodes (25): Admin Operational Overview Dashboard, Annex A-E Submission Form, POST /api/submit endpoint, confirmSubmit(), OAuth Auth Callback Popup, Division Consolidated Reports Screen (admin), Login Screen (Ormoc City Division LRP), loadAnalytics() (+17 more)

### Community 1 - "Server Express Backend"
Cohesion: 0.11
Nodes (16): activeSessions, app, blockedRequests, cors, { createClient }, express, fs, HTML_DIR (+8 more)

### Community 2 - "Package Metadata"
Cohesion: 0.11
Nodes (17): author, bugs, url, description, homepage, keywords, license, main (+9 more)

### Community 3 - "Runtime Dependencies"
Cohesion: 0.13
Nodes (15): axios, cors, dotenv, express, @opencode-ai/plugin, dependencies, axios, cors (+7 more)

### Community 4 - "Access Management"
Cohesion: 0.20
Nodes (11): Access Management Screen (admin), Access request endpoints (/api/access-requests), approve(email), Admin audit log / live monitoring, loadRequests(), revoke(email), Access verification security protocol, Pending Approval Screen (functional) (+3 more)

### Community 5 - "Annex Form Submission Logic"
Cohesion: 0.25
Nodes (7): buildSummaryHTML(), DateInput (partial date component), handleSaveDraft(), handleSubmit(), ModuleAReportingPanel (React component), showReportDetail(), Partial date encoding (::y:..|m:..|d:..)

### Community 6 - "Annex A-E Modules"
Cohesion: 0.52
Nodes (7): Annex A — School-Based Incident Report on Bullying, Annex B — School-Based Incident Report on Child Abuse, Annex C — Children at Risk (CAR) Registry, Annex D — School-Based Consolidated Report on CICL, Annex E — School-Based Consolidated Report on Other Learner Rights, annexLabel() (full annex titles), annexLabel() (analytics)

### Community 7 - "OpenCode Plugin References"
Cohesion: 0.29
Nodes (6): plugin, $schema, opencode-agent-memory, .opencode/plugins/semantic_chunk.ts, .opencode/plugins/semantic_diff.ts, .opencode/plugins/smart_read.ts

### Community 8 - "Supabase Auth Migrations"
Cohesion: 0.33
Nodes (4): auth.users, public.handle_new_user, on_auth_user_created, public.profiles

### Community 9 - "Dashboard Population Script"
Cohesion: 0.60
Nodes (5): applyDashboardData(), generateDashboardData(), getIncidentTypeColor(), getIncidentTypeTextColor(), processSchemaData()

### Community 10 - "Semantic Diff Plugin"
Cohesion: 0.60
Nodes (5): blockEnd(), execute(), heuristicNames(), initTreeSitter(), tsNames()

### Community 11 - "Semantic Chunk Plugin"
Cohesion: 0.70
Nodes (4): execute(), heuristicChunk(), initTreeSitter(), tsChunk()

### Community 12 - "Smart Read Plugin"
Cohesion: 0.60
Nodes (4): CACHE_DIR, computeLineDiff(), execute(), hashPath()

### Community 13 - "Project Config Docs"
Cohesion: 0.67
Nodes (3): Kilo Project Instructions, AGENTS.md Agent Memory Directive, pnpm Workspace Config

## Knowledge Gaps
- **55 isolated node(s):** `CACHE_DIR`, `$schema`, `opencode-agent-memory`, `.opencode/plugins/smart_read.ts`, `.opencode/plugins/semantic_chunk.ts` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Annex A-E Submission Form` connect `LRP Frontend Screens & Auth` to `Annex A-E Modules`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Draft API endpoints (/api/drafts)` connect `LRP Frontend Screens & Auth` to `Annex Form Submission Logic`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Access Management Screen (admin)` connect `Access Management` to `LRP Frontend Screens & Auth`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Annex A-E Submission Form` (e.g. with `Division Consolidated Reports Screen (admin)` and `School Analytics Dashboard`) actually correct?**
  _`Annex A-E Submission Form` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `School Analytics Dashboard` (e.g. with `Admin Operational Overview Dashboard` and `Annex A-E Submission Form`) actually correct?**
  _`School Analytics Dashboard` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `auth-guard.js (shared auth setup)` (e.g. with `Access Management Screen (admin)` and `Admin Operational Overview Dashboard`) actually correct?**
  _`auth-guard.js (shared auth setup)` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CACHE_DIR`, `$schema`, `opencode-agent-memory` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._