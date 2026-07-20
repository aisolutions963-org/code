# WoodWings — System Architecture

This document gives a complete picture of the system. Anyone who reads it should be able to navigate the codebase, add features, and debug issues without needing to reverse-engineer the code.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Database Schema (Airtable)](#5-database-schema-airtable)
6. [Data Access Layer](#6-data-access-layer)
7. [API Routes](#7-api-routes)
8. [Business Logic & Lifecycle](#8-business-logic--lifecycle)
9. [Task System](#9-task-system)
10. [Payment Flow](#10-payment-flow)
11. [Notifications & Email](#11-notifications--email)
12. [Roles & Permissions](#12-roles--permissions)
13. [Frontend Structure](#13-frontend-structure)
14. [Environment Variables](#14-environment-variables)
15. [Key Patterns & Gotchas](#15-key-patterns--gotchas)

---

## 1. System Overview

WoodWings is an internal project management tool for a fit-out / interior design company. It tracks every project from initial client contact through design, fabrication, installation, handover, and post-warranty maintenance.

**Data flow:**
```
Browser → Next.js API routes → Airtable (all project/task data)
                             → Turso SQLite (auth: users, sessions, notifications)
```

**Deployment:**
- **Vercel** — hosts the Next.js app
- **GitHub Actions** — runs cron jobs (inactivity check, weekly reminders, monthly audit)
- **Turso** — cloud SQLite for auth and notifications
- **Resend** — transactional email

---

## 2. Tech Stack

| Package | Purpose |
|---------|---------|
| `next` | App framework (App Router, server components) |
| `react` / `react-dom` | UI |
| `typescript` | Type safety |
| `@libsql/client` | Turso/libSQL SQLite client (auth DB) |
| `jose` | JWT signing/verification for sessions |
| `bcryptjs` | Password hashing |
| `zod` | All API input validation |
| `swr` | Client-side data fetching / cache invalidation |
| `react-hot-toast` | UI toast notifications |
| `resend` | Transactional email |
| `recharts` | Charts in superadmin dashboard |
| `exceljs` | Excel report generation |
| `tailwindcss` | Styling |
| `lru-cache` | Login rate limiting (5 attempts / 15 min per IP) |
| `node-cache` | Server-side in-process cache |
| `date-fns` | Date utilities |
| `@playwright/test` | End-to-end tests |
| `vitest` | Unit tests |

**No Airtable SDK** — all Airtable access is raw `fetch` against the Airtable REST API with a custom retry wrapper.

---

## 3. Project Structure

```
app/
  api/                        All backend API routes (Next.js Route Handlers)
  dashboard/                  All UI pages
    sed/                      SED role dashboard
    fab/                      Fabrication role dashboard
    fix/                      Installation role dashboard
    mgr/                      Manager role dashboard
    superadmin/               Superadmin dashboard + sub-pages
    pipeline/                 Kanban pipeline view
    client-requests/          Client requests view
    project/[id]/             Project detail page
    forms/                    Forms page (payments, gate pass, etc.)
    notifications/            Notifications page
  login/                      Login page
  change-password/            Force-password-change page
  admin/health/               Admin health check UI

components/
  tasks/                      TaskCard, GatewaySection, per-task panel components
  projects/                   Project pipeline, materials, items, payments UI
  followups/                  Follow-up log view
  materials/                  Materials view
  calendar/                   Unified calendar
  finance/                    Payables / receivables views
  pipeline/                   Pipeline column + card components
  layout/                     Sidebar, top bar, mobile nav
  providers/                  SWR provider
  ui/                         Generic UI atoms (Badge, Button, Modal, etc.)

lib/
  airtable/
    _client.ts                Core: fetch helpers, field extractors, transformers
    index.ts                  Barrel — re-exports all sub-modules
    projects.ts               Project CRUD + client record management
    tasks.ts                  Task CRUD + all generation logic
    payments.ts               Payment CRUD
    calendar.ts               Calendar event aggregation + creation
    team.ts                   Team member management + workers
    materials.ts              Materials CRUD
    quotations.ts             Quotations, project items, POs, installation logs
    maintenance.ts            Warranty / maintenance record CRUD
    announcements.ts          Announcements CRUD
    client-requests.ts        Sub-project (Trade/Variance/Maintenance) creation
    timesheets.ts             Timesheet CRUD + weekly summary
  auth.ts                     JWT sessions (createSession, getSession, login)
  db.ts                       Turso SQLite (users, notifications, settings, mappings)
  apiHandler.ts               requireRole() HOC for API routes
  permissions.ts              Per-role editable field lists + department filters
  fieldMap.ts                 ALL Airtable table IDs and field IDs (single source of truth)
  types.ts                    All TypeScript interfaces
  validation.ts               All Zod schemas
  notifications.ts            In-app notification helpers (Turso-backed) + Arabic role text
  email.ts                    Resend email functions
  phases.ts                   Stage order constants + PHASE_CONFIG + isAutoTask
  workflow.ts                 Task workflow side-effects (completion → unlock → phase generation)
  orderChain.ts               Pure order-chain unlock rules (planUnlock / isTaskDone) — unit-tested
  projectRef.ts               projectRefLabel(): quotation number+reference display id, WW-xx fallback
  stageDisplay.ts             Single source for stage labels/badge colors across all UIs
  projectPurge.ts             Cascading project delete (tasks, payments, items, events, …)
  sedAccess.ts                SED project-visibility resolution (Airtable owner + SQLite mapping)
  reportUtils.ts              Report helpers (formatProjectRef WW normalisation)
  xlsxHelper.ts               Excel workbook builders for report downloads
  commission.ts               SED commission calculation
  dateUtils.ts                UAE-timezone date helpers (todayUAE)
  env.ts                      Startup env var validation
  logger.ts / metrics.ts / metricsSnapshot.ts / failedRequests.ts   Observability plumbing

scripts/                      DB seeding + maintenance scripts
e2e/                          Playwright end-to-end tests
tests/                        Vitest unit tests
.github/workflows/            GitHub Actions cron jobs
```

---

## 4. Authentication & Authorization

### Session System (`lib/auth.ts`)

Sessions are **JWT tokens** signed with HS256 using `SESSION_SECRET`. Stored as an HTTP-only cookie named `ww_session` (secure in production, sameSite: strict, 24-hour expiry).

**Session payload (`SessionPayload`):**
```ts
{ id: number, name: string, email: string, role: Role, iat?: number, exp?: number }
```

**Role aliases** — Turso `users.role` may store short aliases that are normalized on read:
| Stored | Normalized |
|--------|-----------|
| `mgr` | `manager` |
| `fab` | `fabrication` |
| `fix` | `installation` |

**Key functions:**
- `createSession(user)` — Signs JWT, returns token string
- `getSession()` — Reads cookie → verifies JWT → cross-checks `users.active` in Turso → returns payload or null
- `login(email, password)` — Verifies password with bcrypt; returns payload or `{ requiresPasswordChange: true, tempToken }` if force-change flag is set
- `verifyTempToken(token)` — 1-hour short-lived token for password reset flow
- `setSessionCookie(token)` / `clearSessionCookie()` — Set/clear the cookie

### requireRole() (`lib/apiHandler.ts`)

All API route handlers should be wrapped with `requireRole()`:

```ts
export const POST = requireRole('manager', 'superadmin')(async (req, session, { params }) => {
  // session is typed SessionPayload, params is resolved (awaited)
})
```

If no roles are passed, any authenticated user is allowed. Calls `getSession()` internally. Returns 401 if not authenticated, 403 if wrong role. Also records request metrics and logs failed requests to Airtable `FAILED_REQUESTS` table.

`withErrorHandling()` — simpler wrapper with no auth check (used for cron routes authenticated by `CRON_SECRET` header).

### Roles

| Role | Description |
|------|-------------|
| `superadmin` | Full access everywhere; user management; all data; manual stage advance |
| `manager` | All tasks across all departments; payments; reports; follow-ups |
| `sed` | Own projects only (filtered by Airtable collaborator ID or SQLite mapping); follow-ups; quotation entry |
| `fabrication` | Fabrication department tasks only |
| `installation` | Installation department tasks only; gate pass; measurement scheduling |

### Turso SQLite Tables (`lib/db.ts`)

| Table | Purpose |
|-------|---------|
| `users` | id, name, email, hashed_password, role, active, force_password_change, airtable_member_id |
| `notifications` | id, recipient_role, recipient_user_id, title, body, link, read, category, created_at |
| `metrics_snapshots` | Performance metrics snapshots |
| `settings` | Key/value store (e.g. `accountant_email`) |
| `sed_projects` | project_airtable_id ↔ user_id mapping (SED visibility) |
| `inactivity_alerts` | project_id + alerted_at (dedup guard for inactivity cron) |

---

## 5. Database Schema (Airtable)

**The single source of truth for all Airtable IDs is `lib/fieldMap.ts`.** Never hard-code an Airtable ID anywhere else.

Fields marked **(link)** are `multipleRecordLinks` — when reading they return `string[]` of record IDs; when writing they require `[recordId]` array format.

---

### PROJECTS (`tblNYJQt2YWSWxzHP`)

| Field constant | Field ID | Notes |
|---------------|----------|-------|
| PROJECT_NAME | fldB2vFh3LHlF30uq | |
| PROJECT_ID | fldBjQceUJ8bZm4Qc | Legacy WW number (fallback display ID) |
| QUOTATION_NUMBER | fldRrZXIY4G8B9tkW | e.g. "3457" |
| QUOTATION_REFERENCE | fld9kdlnvEExao7wv | e.g. "r4" |
| PROJECT_STAGE | fldnINS8WLH5nkNGK | singleSelect |
| CLIENT_NAME | fldq8KO7c05etvfo2 | |
| SALES_OWNER | fld2JiufpGFcKCC6U | collaborator |
| COMMUN_SEDS | fldEs8LgBmhAC4XyQ | multipleCollaborators |
| NICKNAME | fldChERvQwVlxO1nR | |
| CLIENT_STATUS | fldwHeIOIoC4yXoua | singleSelect: Broker / End-to-End Client / Designer / Contractor / Developer / Other |
| REQUEST_TYPE | fldDlEFv0as7eOxuS | singleSelect: Trade / Maintenance / Variance (sub-projects only) |
| PARENT_PROJECT | flds3nCf54kT4Ss3s | **(link)** → PROJECTS |
| TRADE_REFERENCE | fldt1VT7rmjxcbo2q | |
| TASKS | fldCezGrdho4OveCs | **(link)** → TASKS |
| PROJECT_ITEMS | fldYcgC7XmHzZk9A1 | **(link)** → PROJECT_ITEMS |
| PAYMENTS | fldtHlJddB54ZHeNZ | **(link)** → PAYMENTS |
| CLIENT | fldwLVEUsKeVLvXSb | **(link)** → CLIENTS |
| INSTALLATION_TEAM_MEMBERS | fldi1aJVJ94RBk6lP | **(link)** → TEAM_MEMBERS |
| PROJECT_TOTAL_COST | fldGFCLmYsTam1SIJ | |
| TOTAL_PAID | fld6BdgaLcTcAMIEH | |
| REMAINING_BALANCE | fldntJTn8N55eazM2 | |
| PAYMENT_PROGRESS | fld4TAQfEBVufRDez | |
| APPROVAL_STATUS | fldH2FdeW2yZyNHdz | |
| EMIRATE / LOCATION / DETAILED_LOCATION | fldIrxYRfumFm6JjU / fld5iIjUh9z7jaJFW / fldoRWDUaeNKEtrbi | |
| MANAGER_NOTES / SED_NOTES | fldr3TvHVibp8QBtg / fldxFwBQKWytFdrBp | |
| PROJECT_DESCRIPTION | fldhpCCy7ZIrh7pax | |
| CLIENT_PHONE | flduN1gfUdUaTN3Af | |

---

### TASKS (`tblOGEvAGcieHMPeX`)

| Field constant | Field ID | Notes |
|---------------|----------|-------|
| TASK_NAME | fld6CUY7CqGjKS4v6 | |
| STATUS | fldZxo3damMz00LZI | To Do / In Progress / Completed / Locked / Pending Approval |
| DEPARTMENT | fldtXZWhiFvsQZdvd | multipleSelects: SED / Fabrication / Installation / Manager / Purchase / Mix |
| PROJECT | fldcHdzmQopPk4iEf | **(link)** → PROJECTS |
| PROJECT_ITEM | fldzE0IPmOCVnKVmC | **(link)** → PROJECT_ITEMS |
| TASK_TEMPLATES_LINK | fld5FPm767CTRLC1R | **(link)** → TASK_TEMPLATES |
| ASSIGNED_TO | fld1vhOD1EY4n5cMb | **(link)** → TEAM_MEMBERS |
| TASK_ORDER | flddrIO6W7xqw6h8d | |
| TEMPLATE_ORDER | fldXxw74bcJFueDDX | lookup from template |
| PATH_CONDITION | fldG5Mvt5DzharM3i | singleSelect: Make Quotation / Visit Site… / Select Sample (item) / Design (item) / etc. |
| TASK_START_DATE | fldt8MlMioYdrNxik | |
| COMPLETION_DATE | fldh1O00T2wn9ZNa7 | |
| STARTED_AT / COMPLETED_AT | fldegpR3li3Vmmk65 / fldYARi0NN35mkTn6 | ISO timestamps |
| MANAGER_REVIEW_STATUS | fldii3Ebi2lhAamuq | Not Needed / Pending / Approved / Rejected |
| MANAGER_COMMENT | fldgHFTWfCZtJ1xOW | |
| REQUIRES_MANAGER_REVIEW | fldEt5qAV8SiJoLvl | lookup from template |
| REQUIRES_MANAGER_REVIEW_MANUALLY | fldWCJd2f532pr2q6 | |
| POST_VISIT_OUTCOME | fld8tGPaBKroWulye | |
| PRIORITY_FLAG | fld5rZ88NiEmAeB4f | |
| CALL_COUNT | fldEw1v5H3SyekCoZ | |
| SED_NOTE | fldu64rcx9vPIZXKD | |
| SUPERADMIN_NOTE | fldjVNPzFB76Ik0fh | |
| FOLLOW_UP_OUTCOME | fldqb9Fun4cWf4RYv | Reject Project / SED to Follow Up / Manager to Follow Up |
| TASK_DOCUMENTS | fldWN2jRTtvVk10g7 | attachments |
| FILLERS_MISSING_ITEMS_LIST | fldSTM132XO86l19p | attachments |
| TASK_DOC_LINKS | fldz8YzTtdsVwiJ3I | JSON string (DocLink[]) |
| FILLERS_DOC_LINKS | fldxgHjnRVSlYlHbM | JSON string (DocLink[]) |
| INSTALLATION_SCHEDULE | fld6czB3O8VLmirhY | JSON string (schedule entries) |
| PROJECT_STAGE | fldcS4LsNaEbpYEze | lookup from project |
| PROJECT_ID / PROJECT_RECORD_ID | fldBRW5E8ufAGPyJS / fldKSFnS37UeQmzNQ | lookups |
| TEAM_DAYS_REQUIRED / NO_OF_LABORS_PER_DAY / INSTALLATION_DAYS | fldYEkTSrzjrv3JfF / fldjxiY3vT2DwEUGc / fldWfY6xisE0uhVHB | |
| PLANNED_PROD_START_DATE / EXPECTED_FAB_END_DATE | fldckX33LZhtyyJa6 / fldnPsZJ8hJCEx0qM | |
| FABRICATION_PATH / POST_CARPENTRY_PATH / PRODUCTION_START_PATH | fldAP4I4vbBGKjhyS / fldZjKDnrPSJKLv09 / fldGcM8dsJGvsWQF5 | |
| CONCEPT_DESIGN_APPROVAL / SAMPLE_APPROVAL / QUOTATION_OUTCOME | fldUcR8eVpooRHRWU / fldC6Pl923IfHdrk2 / fldhYsEHetrQxTZ8k | |
| QC_CHECK_AT_SITE_DONE / FILLERS_DONE | fldHrNVNe3abI0FBx / fldeITdFvnLVegVIy | checkboxes |

---

### TASK_TEMPLATES (`tblfJFDNd2dcY1rUk`)

| Field constant | Field ID | Notes |
|---------------|----------|-------|
| TASK_NAME | fldhUOs66e7p0IRhR | |
| DEPARTMENT | fldpMqqDluxlVU7Qz | multipleSelects |
| TEMPLATE_ORDER | fldQVmI7bzlIIllZQ | numeric sort position |
| PROJECT_STAGE | fld7qqK3fUM8gjt6Z | Preparing / Open / Closing / Closed & Valid Maintenance |
| PATH_CONDITION | fldBEIquy9HDAprY7 | branch label |
| PHASE | flddIfmNdbQ45fVUd | Phase 2 — Opening / Phase 3 — Working / Phase 4 — Closing |
| REQUIRES_MANAGER_REVIEW | fldypvKqW3vyNsrY4 | checkbox |
| INSTRUCTIONS / ARABIC_INSTRUCTIONS | fldsfoFM1RtZyT5wX / fldT16R9UBY0UybHk | |

---

### PAYMENTS (`tblTrLUuGRGt5iSwD`)

Fields: NAME, NOTES, PROJECT **(link)**, AMOUNT, PAYMENT_TYPE, PAYMENT_STATUS, PAYMENT_METHOD, REFERENCE_NO, RECEIVED_DATE, DUE_DATE, STAGE_AT_PAYMENT, PAYER_TYPE, PAYER_NAME, COMMISSION_AMOUNT, RECORDED_BY, ACCOUNTANT_APPROVED.

---

### Other Tables

| Table | Constant | Table ID | Key fields |
|-------|----------|----------|-----------|
| Clients | CLIENTS | tblRDICf8jQOOvQPf | CLIENT_NAME, PHONE, EMAIL, PROJECTS (link) |
| End Users | END_USERS | tblb0ZAwU0gvP2Qht | NAME, PHONE_EMAIL, PROJECT (link), CLIENT (link) |
| Project Items | PROJECT_ITEMS | tblWg3ijuhV1JsijY | ITEM_NAME, PROJECT (link), STATUS, TASKS (link), QUANTITY |
| Quotations | QUOTATIONS | tbllITZymuWCZ9tde | NAME, PROJECT (link), PROJECT_ITEM (link), QUOTE_NUMBER, CLIENT_NAME, Q_STATUS |
| Follow-up Logs | FOLLOW_UP_LOG | tblHzJiOoOTqWPUwq | QUOTATION (link), DATE, METHOD, OUTCOME, NEXT_DATE, DONE_BY, NOTES |
| Team Members | TEAM_MEMBERS | tbleyX0MkYf1OucMS | NAME, SYSTEM_ROLE, ACTIVE, AIRTABLE_EMAIL |
| Workers | WORKERS | tblaelluGouAlw7Xo | NAME, FULL_NAME, NICKNAME, ROLE, WORKER_TYPE, HOURLY_RATE, ACTIVE |
| Maintenance | MAINTENANCE | tblX5VNBzyFDsuZXD | PROJECTS (link), STATUS, START_DATE, END_DATE, WARRANTY_TYPE |
| Materials | MATERIALS_NEEDED | tblDTNeiICTwzdi6N | PROJECTS (link), NAME, SUPPLIER, QUANTITY, UNIT, ORDER_STATUS, PURPOSE |
| Purchase Orders | PURCHASE_ORDERS | tblXyum6bJJltk2vE | PROJECT (link), SUPPLIER, TOTAL_AMOUNT, PO_STATUS |
| Installation Logs | INSTALLATION_LOGS | tbljrel5tmlHMmJxt | PROJECT (link), DATE, WORK_DESCRIPTION, INSTALLATION_TEAM |
| Handover Sheets | HANDOVER_SHEETS | tblm5eS4DqQvxELPw | PROJECT (link), STATUS, FINAL_INSTALLATION_DATE, CUSTOMER_SATISFACTION |
| Calendar Events | CALENDAR_EVENTS | tblnG8M3db73zeiNS | TITLE, DATE, PROJECT (link), CREATED_BY, CUSTOM_TASK |
| Timesheets | PRODUCTION_TIMESHEETS | tblEAgsiTCNCQmTZl | WORKER (link), PROJECT (link), WORK_DATE, REGULAR_HOURS, OVERTIME_HOURS |
| Announcements | ANNOUNCEMENTS | tbluhehjxkkNcmTMl | TITLE, MESSAGE, PINNED, VISIBLE_TO, EXPIRES_AT |
| System Logs | SYSTEM_LOGS | tblfiHmuJYwiOXRVX | EVENT, LEVEL, REQUEST_ID, DURATION_MS, METADATA, TIMESTAMP |
| Failed Requests | FAILED_REQUESTS | tblFXMso3NbWMCp29 | ENDPOINT, METHOD, ERROR_MESSAGE, INPUT_PAYLOAD, REPLAYED |
| Receivables | RECEIVABLES | tblpPWR7Xl6Tic8AT | CLIENT_COMPANY, LINKED_PROJECT (link), ORIGINAL_AMOUNT, BALANCE_DUE, DEBT_STATUS |
| Payables | PAYABLES | tblPjIqCwFFVPCsce | PAYABLE_TO, LINKED_PROJECT (link), TOTAL_AMOUNT, AMOUNT_PAYABLE, PAYMENT_STATUS |

---

## 6. Data Access Layer

All Airtable access goes through `lib/airtable/`. Import from `@/lib/airtable` (the barrel `index.ts` re-exports everything).

### Core Helpers (`lib/airtable/_client.ts`)

**Fetching:**
- `fetchWithRetry(url, opts, retries=3)` — Retries on 429/503 with `attempt × 1s` backoff
- `fetchAll(tableId, opts)` — Paginates using `offset` until all records are fetched (100/page); always uses `returnFieldsByFieldId=true`
- `rateLimitedFetch()` — Enforces 250ms minimum between requests to avoid Airtable rate limits

**Field extractors — use these, never access raw field values directly:**

| Helper | Use for |
|--------|---------|
| `str(val)` | singleLineText, singleSelect `.name`, plain string. Returns `string \| undefined`. Returns `undefined` for arrays. |
| `strArr(val)` | **multipleRecordLinks** (returns record ID strings), any array field. Returns `string[]`. |
| `lookupStrArr(val)` | `multipleLookupValues` fields. Handles `{valuesByLinkedRecordId: {...}}` wrapper. |
| `num(val)` | number fields |
| `bool(val)` | checkbox fields |
| `selectName(val)` | singleSelect fields that return `{id, name, color}` objects |
| `attachments(val)` | Airtable attachment arrays → `Attachment[]` |
| `parseDocLinks(val)` | JSON string stored in text field → `DocLink[]` |
| `firstLinkedRecord(val)` | Returns `{id, name, email}` from first collaborator record |

**Transform functions (raw Airtable record → typed object):**
- `transformTask(record)` → `Task`
- `transformProject(record)` → `Project`
- `transformPayment(record)` → `Payment`
- `transformMaintenance(record)` → `MaintenanceRecord`

### Exported Functions by Module

**`projects.ts`:** `getProjects`, `getAllProjects`, `getProjectById`, `getProjectNamesByIds`, `updateProject`, `createProject`, `deleteProjectById`, `getOrCreateClient`, `createEndUser`, `getProjectIdsForSedByEmail`, `getCalendarProjects`, `uploadAttachmentToRecord`, `createHandoverSheet`, `updateHandoverSheet`, `getHandoverSheetForProject`, `projectNameExists`

**`tasks.ts`:** `getTaskTemplates`, `createTasksBatch`, `getTasksByRole`, `getTaskById`, `updateTask`, `updateTaskRaw`, `getAllTasksForProject`, `getTasksForProject`, `getIncompleteTasksForProject`, `getLockedTasksForScope`, `getLockedBranchTasksForProject`, `checkAndUnlockCallClientTask`, `checkAndUnlockInactivityFollowUp`, `getCallClientPendingTasks`, `getPendingApprovalsCount`, `attachFileToTask`, `deleteTasksByProjectId`, `createAdHocTask`, `measurementTaskExists`, `generateTasksForProject`, `generateItemTasksForProject`, `generatePhase3TasksForItem`, `generatePhase4Tasks`

**`payments.ts`:** `getPaymentsByProject`, `getPaymentsByProjectIds`, `getAllPayments`, `createPayment`, `updatePayment`, `getSedQuarterlyRevenue`

**`calendar.ts`:** `getCalendarEvents`, `createCalendarEvent`, `upsertF2DeliveryEvent`, `upsertReminderEvent`

**`team.ts`:** `getInstallationTeamMembers`, `assignInstallationTeam`, `createTeamMember`, `updateTeamMember`, `deleteTeamMember`, `getAllWorkers`, `createWorker`, `updateWorker`, `deleteWorker`

**`materials.ts`:** `getAllActiveMaterials`, `getMaterialsByProject`, `getPendingMaterialsCount`, `updateMaterialOrderStatus`, `createMaterials`, `createMaterialOrder`

**`quotations.ts`:** `createProjectItem`, `getProjectItemsForProject`, `createQuotation`, `getQuotationsByProject`, `getPurchaseOrdersByProject`, `createPurchaseOrder`, `getInstallationLogsByProject`, `createInstallationLog`

**`maintenance.ts`:** `getMaintenanceRecords`, `getMaintenanceRecordForProject`, `createMaintenanceRecord`, `activateMaintenanceRecord`, `expireMaintenanceRecord`

**`client-requests.ts`:** `createClientRequest`, `getClientRequests`, `getClientRequestsByParentProject`, `updateClientRequestTradeReference`

**`timesheets.ts`:** `getTimesheetEntries`, `createTimesheetEntry`, `updateTimesheetEntry`, `deleteTimesheetEntry`, `getTimesheetEntryById`, `getTimesheetWeeklySummary`, `checkTimesheetDuplicate`

**`announcements.ts`:** `getAnnouncements`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`

---

## 7. API Routes

Routes follow Next.js App Router conventions at `app/api/`. All use either `requireRole()` or `withErrorHandling()`. Body validation uses Zod schemas from `lib/validation.ts`.

### Auth
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/login` | POST | Public | Rate-limited (5/15min per IP). Returns session cookie or `{ requiresPasswordChange }`. |
| `/api/auth/logout` | POST | Any | Clears session cookie. |
| `/api/auth/change-password` | POST | Temp token | Verifies temp token, sets new password. |

### Projects
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/projects` | GET | Any | SED: own projects only. Others: stage-filtered. Params: `stage`, `all`, `includeRequests`. |
| `/api/projects` | POST | sed, manager, superadmin | Creates project at 'Preparing'; generates Phase 1 tasks; maps SED in SQLite. |
| `/api/projects/[id]` | GET | Any | Project + role-filtered tasks + payments (manager/superadmin only). |
| `/api/projects/[id]` | PATCH | sed, manager, superadmin | Updates: installation team / address / notes / quotation number+reference. |
| `/api/projects/[id]` | DELETE | superadmin | Deletes all tasks then project. |
| `/api/projects/[id]/advance` | POST | superadmin | Advances stage; fires task generation for new stage. |
| `/api/projects/[id]/generate-tasks` | POST | superadmin | Force-generate tasks for a stage. `stage='phase3'` generates per-item Phase 3 tasks. |
| `/api/projects/[id]/quotation` | POST | sed, manager, superadmin | Creates quotation + project items; triggers `generateItemTasksForProject` per item. |
| `/api/projects/[id]/items` | POST | sed, manager, superadmin | Creates a project item. |
| `/api/projects/[id]/items/[itemId]` | POST | sed, manager, superadmin | Adds initial action tasks to an item. |
| `/api/projects/[id]/handover` | GET | installation, manager, superadmin, sed | Returns handover sheet. |
| `/api/projects/[id]/handover` | POST | installation, manager, superadmin | Creates/updates handover; advances project to 'Closed'; notifies roles. |
| `/api/projects/[id]/request-measurement` | POST | sed, manager, superadmin | Creates "Take Measurements" ad-hoc task for Installation dept. |
| `/api/projects/[id]/assign-installation` | POST | manager, superadmin | Assigns installation team members. |
| `/api/projects/[id]/disapprove` | POST | manager, superadmin | Marks project not-approved. |
| `/api/projects/[id]/reopen` | POST | superadmin | Reopens a rejected project. |
| `/api/projects/[id]/report` | GET | manager, superadmin | Project report export. |
| `/api/projects/[id]/materials` | GET | Any | Materials for the project. |
| `/api/projects/[id]/purchase-orders` | GET | Any | POs for the project. |
| `/api/projects/[id]/installation-logs` | GET | Any | Installation logs. |
| `/api/projects/[id]/attachments` | GET | Any | All task attachments for the project. |
| `/api/projects/[id]/items-progress` | GET | Any | Item progress summary. |
| `/api/projects/[id]/requests` | GET / POST | Any / sed, manager, superadmin | Client sub-requests for a parent project. |
| `/api/projects/[id]/inactivity-check` | POST | superadmin | Manual inactivity check trigger. |

### Tasks
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/tasks` | GET | Any | Role-filtered tasks. Params: `projectId`, `sedProjectIds`. |
| `/api/tasks/[id]` | GET | Any | Single task. |
| `/api/tasks/[id]` | PATCH | Any (field-level check) | Status transitions, manager review, doc uploads, gate unlock triggers. |
| `/api/tasks/pending-approvals` | GET | Any | Count of tasks with status Pending Approval. |
| `/api/tasks/[id]/assign-measurement` | POST | manager, sed, superadmin | Assigns measurement date + team member; creates measurement task from template; fires calendar event + notification. |
| `/api/tasks/[id]/assign-maintenance` | POST | manager, sed, superadmin | Assigns maintenance team. |
| `/api/tasks/[id]/call-outcome` | POST | sed, manager, superadmin | Handles "Call the Client" task outcome (approved / review / refused). |
| `/api/tasks/[id]/complete-branch` | POST | Any | Completes a sample branch task. |
| `/api/tasks/[id]/f3-order` | POST | sed, manager, superadmin | Handles F3 material order (small/big path choice). |

### Payments
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/payments` | GET | manager, superadmin | Params: `projectId`, `projectIds` (comma-sep), `all=true`. |
| `/api/payments` | POST | manager, superadmin | Creates payment with duplicate guards; creates calendar event; emails accountant; Final payment → closes project. |
| `/api/payments/[id]` | GET | manager, superadmin | Single payment. |
| `/api/payments/[id]` | PATCH | manager, superadmin | Updates payment (void = status → Cancelled). |

### Other Routes (summary)
| Route | Auth | Description |
|-------|------|-------------|
| `/api/notifications` GET/PATCH | Any | In-app notifications for user. PATCH marks as read. |
| `/api/follow-ups` GET/POST | sed, manager, superadmin | Follow-up logs + active quotation picker. |
| `/api/client-requests` GET/POST | sed, manager, superadmin, installation | Sub-project (Trade/Variance/Maintenance) listing + creation. |
| `/api/calendar` GET/POST | Any | Aggregated calendar events + custom event creation. |
| `/api/materials` GET | manager, superadmin | All active materials. |
| `/api/materials/[id]` PATCH | manager, superadmin | Update material order status. |
| `/api/maintenance` GET | manager, superadmin, sed | Warranty/maintenance records. |
| `/api/clients` GET | Any | All client records. |
| `/api/announcements` GET | Any | Role/expiry-filtered announcements. |
| `/api/announcements` POST/PATCH/DELETE | superadmin | Announcement CRUD. |
| `/api/users` GET/POST | superadmin | User management. |
| `/api/users/[id]` GET/PATCH/DELETE | superadmin | Single user. PATCH syncs Airtable team member. |
| `/api/timesheets` GET/POST | manager, superadmin | Timesheet entries (duplicate guard: supervisor+date). |
| `/api/timesheets/summary` GET | manager, superadmin | Weekly summary. |
| `/api/timesheets/workers` GET | manager, superadmin | Worker list. |
| `/api/workers` GET/POST/PATCH/DELETE | superadmin | Workers CRUD. |
| `/api/team/installation` GET | Any | Active installation team members. |
| `/api/team/sed` GET | Any | SED team members. |
| `/api/purchase-orders` GET/POST | manager, superadmin | PO CRUD. |
| `/api/installation-logs` GET/POST | Any / installation, manager, superadmin | Installation log entries. |
| `/api/receivables` GET/POST/PATCH/DELETE | manager, superadmin | Receivables CRUD. |
| `/api/payables` GET/POST/PATCH/DELETE | manager, superadmin | Payables CRUD. |
| `/api/settings` GET/POST | superadmin | Key-value settings. |
| `/api/home` GET | Any | Home page data (announcements, unread count). |
| `/api/sed/commission` GET | sed, manager, superadmin | SED commission data. |
| `/api/superadmin/*` GET | superadmin | KPIs, metrics, SED stats, team tasks, timeline, work hours. |
| `/api/reports/download/*` GET | manager, superadmin | Excel report downloads. |
| `/api/admin/health` GET | superadmin | System health + Airtable connectivity. |
| `/api/admin/logs` GET | superadmin | System logs. |
| `/api/admin/sync-users` POST | superadmin | Syncs Airtable team members → SQLite users. |
| `/api/admin/replay/[id]` POST | superadmin | Replays a failed request. |
| `/api/workflow/unlock` POST | superadmin | Manual task unlock. |
| `/api/health` GET | Public | Basic health check. |

### Cron Routes (authenticated by `CRON_SECRET` header, called from GitHub Actions)
| Route | Schedule | Description |
|-------|----------|-------------|
| `/api/cron/inactivity-check` | Daily 08:00 UAE | Projects in **Preparing/Open/Production/Closing** with >3 days since last task modification → unlock "Follow Up" task → notify superadmin, naming the last-touched task and its status. Also auto-expires overdue warranties and purges projects trashed >30 days. Dedup via Turso `inactivity_alerts` (one alert per project per day). |
| `/api/cron/weekly-reminder` | Weekly (Friday) | Notifies manager + superadmin about Preparing-stage projects. Upserts calendar event. |
| `/api/cron/monthly-audit` | Monthly | Monthly audit report. |

All three are triggered by GitHub Actions workflows in `.github/workflows/` (`APP_URL` + `CRON_SECRET` repo secrets), not Vercel crons.

---

## 8. Business Logic & Lifecycle

### Project Stages

Defined in `lib/phases.ts`:
```ts
STAGE_ORDER = ['Preparing', 'Open', 'Production', 'Closing', 'Closed', 'Closed and active warranty', 'Warranty expired']
```

Off-ramp stage referenced in code: `Not-Approved` (rejected projects; superadmin reopen deletes its tasks and regenerates Preparing from scratch). `Closed` = delivered, administrative work (final payment) still pending. Display names/colors for every stage come from `lib/stageDisplay.ts` — all badges and the home pipeline read the project's real `projectStage`.

**Active stages** (appear in dashboards, dropdowns, follow-up pickers): all except `Closed`, `Closed and active warranty`, `Warranty expired`.

### Client Request Sub-Projects

Three types are stored as PROJECTS records with `REQUEST_TYPE` set:

| Type | Project name prefix | Reference (stored in `TRADE_REFERENCE`) | Auto-generated tasks |
|------|--------------------|------------------------------------------|--------------------|
| `Trade` | `[Trade] {parentName}` | `{quotNum}{Trx}{quotRef}{tradeQuotNum}` e.g. `2341Tr1R354327` | "F3 — Order Trade Material" (SED) → "F4 — Trade Payment" (Manager) → "Handover to Client" (SED) |
| `Maintenance` | `[Maintenance] {parentName}` | `{quotNum}{Mx}{quotRef}` e.g. `2341M1R3` (Mx typed at creation, required) | "Site Visit & Assessment" → "Carry Out Maintenance Work" → "Client Sign-off" (all SED dept) |
| `Variance` | `[Variance] {parentName}` | `{quotNum}{VRx}{quotRef}` e.g. `2341VR1R3` | Runs standard `generateTasksForProject('Preparing')` — the full project workflow |

Trade/Maintenance unlock sequentially via the `CR_TASK_SEQUENCE` name→position map (their tasks have no template order); Variance is driven by the normal order-chain engine. All types inherit SED, clientName, clientPhone from the parent project and are mapped in SQLite `sed_projects`.

### Gate Pass / Handover

When installation submits a handover form (`POST /api/projects/[id]/handover`):
1. Upserts handover sheet in HANDOVER_SHEETS
2. Sets project stage → `Closed`
3. Notifies manager, sed, superadmin to request final payment

---

## 9. Task System

### Template-Based Task Generation

The `TASK_TEMPLATES` table is the library. Every task in the system is either generated from a template or created ad-hoc. Templates define: task name, department(s), stage, order, path condition, manager review requirement.

**Template orders that are NEVER auto-generated** (on-demand only):
```ts
GLOBALLY_EXCLUDED_TEMPLATE_ORDERS = [4, 5, 24, 25]
```
These are measurement-related tasks that only get created through specific user actions.

### Phase Generation Functions

**`generateTasksForProject(projectId, stage)`** — Phase 1 (Preparing) and Phase 2 (Open) project-level tasks:
1. Locks all existing To Do / In Progress / Pending Approval tasks for the project
2. Fetches templates for the given stage
3. Computes which tasks start as `To Do` vs `Locked` based on `templateOrder`:
   - Universal tasks (no pathCondition): lowest order = To Do; rest = Locked
   - In Preparing: the very first task is auto-completed (site visit already done)
   - Path tasks: `Sample Branch:*` tasks start Locked; other path tasks start To Do at the lowest order in their branch
4. Creates all tasks via `createTasksBatch`

**`generateItemTasksForProject(projectId, itemId, chosenPaths)`** — Per-item tasks (template orders ≥23):
- Only includes templates matching the chosen action paths
- Deduplicates by template ID (safe to call multiple times)
- Lowest order per path = To Do; rest = Locked

**`generatePhase3TasksForItem(projectId, itemId)`** — Phase 3 "Working" per-item:
- Templates with `phaseLabel === 'Phase 3 — Working'`
- Triggered when the task at `templateOrder === 29` completes (`maybeGeneratePhase3()`)
- Also advances project to 'Production' stage

**`generatePhase4Tasks(projectId)`** — Closing + warranty tasks:
- Templates from both 'Closing' AND 'Closed & Valid Maintenance' stages
- Triggered by `maybeGeneratePhase4()` when all per-item tasks complete

### When Each Phase Is Triggered

| Phase | Trigger |
|-------|---------|
| Phase 1 (Preparing tasks) | Project creation (`POST /api/projects`) |
| Phase 2 (Open tasks) | "Call the Client" approved (`handleCallClientOutcome`) |
| Per-item tasks | Quotation submitted (`POST /api/projects/[id]/quotation`) |
| Phase 3 per-item | Task at order 29 completes (`maybeGeneratePhase3`) |
| Phase 4 (Closing+Warranty) | All per-item tasks done (`maybeGeneratePhase4`) or superadmin force-advance |

### Task Unlock / Order Chain (`lib/orderChain.ts` — pure + unit-tested)

On every task completion, `unlockNextTasks` (lib/workflow.ts) calls `planUnlock(task, allProjectTasks, perItemOrderMin)`:

- **Strict scope separation** — a per-item completion only considers that item's tasks; a project-level completion only project-level tasks. Items advance independently.
- **AND-join** — the next `templateOrder` unlocks only when EVERY lower-order task in scope is "done".
- **`isTaskDone` rules** (what counts as done / never blocks):
  - `Completed`, or name contains "optional"
  - **Fabrication branches** — Carpentry/Paint (by path OR by name, since Phase-3 generation creates them path-less): branches, never gates
  - **Measurement side-tasks** — any task named "Take Measurement…": an assigned installation side-job, never gates the admin chain
  - **Unchosen/abandoned gateway alternatives** — `pathCondition` set + To Do or Locked
  - The triggering task itself is excluded from the blocked-scan (F3 big-order stays In Progress by design)
- Tasks matched by `isAutoTask` (lib/phases.ts — "(auto)" names, headline banners, the order-64 closing transition) auto-complete on unlock, apply closing stage transitions, and re-trigger the chain once.
- Gate-controlled tasks ("Call the Client", "Take Approval") never unlock via the order chain — only via `maybeUnlockCallClient` when all `[GATE]` tasks complete.

### Measurement Flow

1. **SED requests measurement** → `POST /api/projects/[id]/request-measurement` → `createAdHocTask({ taskName: 'Take Measurements', projectId, departments: ['Installation'] })` → notification to installation role

2. **SED/Manager assigns date & team** (MeasurementTeamPanel → `POST /api/tasks/[id]/assign-measurement`): looks up the measurement template (order 5 project-level / order 25 per-item) → spawns the Installation task via `createTasksBatch` — **deliberately path-less** (a pathed project-level task would render as a SED gateway chip and leak into the SED feed) → retires the generation-created pathed "Take Measurement" gateway sibling (`supersedeGatewayMeasurementTasks`) → creates a calendar event titled `Take Measurements — {ref} · {project} › {item}` (upserted on `task:{id}`) → Arabic notification to installation → marks the SED chip Completed.

3. **Per-item measurement tasks (order 25)** behave as plain status tasks (To Do → In Progress → Completed + notes). No Assign & Notify panel.

### Ad-hoc Tasks

`createAdHocTask({ taskName, projectId, departments, status? })` — Creates a single task with `TASKS.DEPARTMENT` set. Used for measurement requests and client request sub-tasks.

---

## 10. Payment Flow

### Payment Types
`Advance`, `Delivery`, `Material`, `Final`, `Progressive Payment`, `Trade`, `Variance`, `Maintenance`

### Payment Statuses
`Received`, `Pending`, `Overdue`, `Cancelled` (void)

### Duplicate Guards (both checked before creation)
1. **Final payment guard**: Only one non-Cancelled Final payment per project (409 Conflict)
2. **General guard**: Same type + amount + received date already exists → 409 Conflict

### On Payment Create (`POST /api/payments`)
1. Fetch project → capture `stageAtPayment` automatically
2. Check duplicates
3. Create payment record
4. Create calendar event server-side using `body.receivedDate` (title: `"{type} — {project}"`)
5. Email accountant (fire-and-forget)
6. If `paymentType === 'Final'` → `closeProjectAfterFinalPayment()`:
   - Activate / create maintenance record (1-year warranty)
   - Set project stage → `Closed and active warranty`
   - Email accountant via `notifyAccountantEvent`
   - In-app notification to sed, manager, superadmin

### Task-side completion guards (`PATCH /api/tasks/[id]`)
- **Make Quotation / any F4 task** cannot complete until the project has BOTH a quotation number and reference (the F4 form auto-fills them read-only when set, and saves them to the project when entered).
- **Final F4 (order 62)** additionally requires a recorded, non-cancelled `Final` payment — the project can't reach active warranty without the money booked.

### Payment Visibility
Only `manager` and `superadmin` can see payments. Controlled by `canSeePayments(role)` in `lib/permissions.ts` and enforced in `GET /api/projects/[id]`.

---

## 11. Notifications & Email

### In-App Notifications (`lib/notifications.ts` + Turso SQLite)

```ts
createNotification({
  recipientRole: 'installation',        // targets all users of this role
  recipientUserId?: 42,                 // OR target a specific user
  title: 'Measurement scheduled',
  body: 'Date: 2026-07-01 ...',
  link: '/dashboard/fix',
  category?: 'default',
})
```

Auto-prunes records older than 30 days.

**Department → Role mapping (`DEPT_ROLE_MAP`):**
| Department | Role notified |
|-----------|--------------|
| SED | sed |
| Fabrication | fabrication |
| Installation | installation |
| Manager / Management | manager |
| Purchase | manager |

**`ROLE_DASHBOARD`** map (used for notification links):
| Role | Dashboard path |
|------|---------------|
| sed | /dashboard/sed |
| fabrication | /dashboard/fab |
| installation | /dashboard/fix |
| manager | /dashboard/mgr |
| superadmin | /dashboard/superadmin |

### Email (`lib/email.ts`, Resend)

Sender: `WoodWings <notifications@woodwings.ae>`

| Function | Recipient | Trigger |
|----------|-----------|---------|
| `notifyAccountant(payment)` | ACCOUNTANT_EMAIL | New payment recorded |
| `notifyAccountantEvent(params)` | ACCOUNTANT_EMAIL | Final payment / project closure |
| `notifyManager(task)` | MANAGER_EMAIL | Task submitted for review |
| `notifyManagerEscalation(project)` | MANAGER_EMAIL | 3 call attempts reached (Not-Approved) |
| `notifyCallClient(project)` | MANAGER_EMAIL | All approval gates cleared |
| `notifyRejection(params)` | Submitter's email | Task rejected by manager |
| `notifyAutoTaskEvent(params)` | MANAGER_EMAIL | Automated workflow step |

All emails only fire when `process.env.RESEND_API_KEY` is set. `ACCOUNTANT_EMAIL` falls back to the `accountant_email` key in the Turso `settings` table.

---

## 12. Roles & Permissions

### Editable Task Fields Per Role (`lib/permissions.ts`)

| Role | Editable task fields |
|------|---------------------|
| `installation` | status, teamDaysRequired, noOfLaborsPerDay, installationDays, installationSchedule, taskDocLinks, fillersDocLinks, completionDate, qcCheckAtSiteDone, fillersDone |
| `sed` | status, postVisitOutcome, taskStartDate, conceptDesignApproval, sampleApproval, quotationOutcome, taskDocLinks, callCount, sedNote |
| `fabrication` | status, fabricationPath, postCarpentryPath, plannedProdStartDate, expectedFabEndDate, taskDocLinks |
| `manager` | status, managerReviewStatus, managerComment, completionDate, taskStartDate, plannedProdStartDate, expectedFabEndDate, taskDocLinks, priorityFlag, teamDaysRequired, noOfLaborsPerDay, installationSchedule |
| `superadmin` | All fields in `UpdateTaskSchema` |

`PATCH /api/tasks/[id]` applies this filter server-side via `filterAllowedFields(role, fields)`.

### Role → Task Department Filter

| Role | Sees tasks for departments |
|------|--------------------------|
| `installation` | Installation |
| `fabrication` | Fabrication |
| `sed` | SED, Fabrication, Installation |
| `manager` | Manager, Purchase, Mix, SED, Fabrication, Installation |
| `superadmin` | All |

### Material Status Changes
Only `manager` and `superadmin` can change material order status (Delivered, Delayed, etc.). `fabrication` and `installation` are read-only for materials.

---

## 13. Frontend Structure

### Dashboard Pages

Each role has a primary dashboard page. All dashboard pages are **server components** that fetch initial data using `getSession()` and pass it to client components.

| Path | Role |
|------|------|
| `/dashboard/sed` | sed |
| `/dashboard/fab` | fabrication |
| `/dashboard/fix` | installation |
| `/dashboard/mgr` | manager |
| `/dashboard/superadmin` | superadmin |
| `/dashboard/pipeline` | All roles |
| `/dashboard/client-requests` | sed, manager, superadmin, installation |
| `/dashboard/project/[id]` | All roles (content filtered by role) |
| `/dashboard/forms` | All roles |
| `/dashboard/notifications` | All roles |

### Key Components

**`components/tasks/TaskCard.tsx`** — The main task card. Determines which panels to show based on task name, role, and `isPerItem` flag. Key computed booleans:
- `isPerItem = !!task.projectItem?.length`
- `isMeasurementTask` — shows `MeasurementTeamPanel` (order 5 tasks only, not per-item)
- `isMaintenanceTask` — shows `MaintenanceTeamPanel`
- `isDecisionTask` — shows `CallClientDecisionPanel`

**`components/tasks/GatewaySection.tsx`** — Renders SED gateway choices (Make Quotation, Visit Site, Select Sample, etc.) and associated panels.

**Task Panels (`components/tasks/panels/`):**
| Panel | Trigger |
|-------|---------|
| `MeasurementTeamPanel` | "Take Measurement" task name + manager/sed/superadmin role + NOT per-item |
| `MaintenanceTeamPanel` | "Carry Out Maintenance Work" task name |
| `CallClientDecisionPanel` | `isCallClientDecisionTask()` check |
| `F2ProductionPanel` | F2 production task |
| `F3OrderPanel` | F3 order task (small/big path) |
| `F5QuotationPanel` | F5 quotation task |
| `OrderSamplePanel` | Order Sample task |
| `QuotationPanel` | Make Quotation gateway |
| `AttachDocsPanel` | Any task with doc upload |

**`components/followups/FollowUpsView.tsx`** — Follow-up log display. Project reference format: `{quotationNumber}{quotationReference}` (direct concatenation, e.g. `3457r4`).

**`components/tasks/NextUpPreview.tsx` + `/api/projects/[id]/next-steps`** — per-scope "what's next" hint on the project page. Role-aware: when the scope's active head belongs to a department the viewer can't see (mirrors the task-feed filter), it renders an amber **"Waiting on {dept}: {task}"** instead of a misleading "Next up" (cross-department handoffs like SED → Manager's "Choose Installation Team").

**`components/finance/PayablesView.tsx` / `ReceivablesView.tsx`** — manual finance ledgers (superadmin + manager, Finance sidebar group). Data comes only from their "+ Add" forms into the Airtable Payables/Receivables tables. Select options in the forms MUST exactly match the Airtable single-select choices — a mismatched value makes Airtable reject the record (save/delete failures surface as toasts and keep the modal open).

### SWR Data Fetching

All client-side data uses SWR. Global provider at `components/providers/SWRProvider.tsx`. Standard pattern:
```ts
const { data, error, mutate } = useSWR('/api/tasks', fetcher)
```

To invalidate after a mutation: `mutate('/api/tasks')` or `globalMutate('/api/projects')`.

---

## 14. Environment Variables

### Required (startup validation in `lib/env.ts`)
```
AIRTABLE_API_KEY          Airtable personal access token
AIRTABLE_BASE_ID          Airtable base ID
SESSION_SECRET            JWT signing secret (minimum 32 characters)
```

### Database (Turso)
```
TURSO_URL                 Turso database URL (or TURSO_DB_URL)
TURSO_AUTH_TOKEN          Turso auth token (or TURSO_DB_AUTH_TOKEN)
                          Optional for local: falls back to file:data/users.db
```

### Email (Resend)
```
RESEND_API_KEY            Resend API key (emails silently skip if not set)
MANAGER_EMAIL             Manager's email for task review + escalation notifications
ACCOUNTANT_EMAIL          Accountant's email (fallback: DB accountant_email setting)
```

### App
```
APP_URL                   Override base URL (fallback: VERCEL_URL → https://woodwings.ae)
VERCEL_URL                Auto-set by Vercel deployment
NODE_ENV                  Controls secure cookie flag (production = secure)
```

### Cron Jobs
```
CRON_SECRET               Bearer token checked in cron route headers (set in GitHub Actions secrets)
```

### Development / Testing
```
DEFAULT_USER_PASSWORD     Default password for admin-synced users
E2E_PASSWORD              Test password for Playwright tests
NEXT_PUBLIC_BASE_URL      Public base URL (client-side references)
```

---

## 15. Key Patterns & Gotchas

### 1. `str()` vs `strArr()` — the most common source of bugs

`TASKS.PROJECT`, `TASKS.PROJECT_ITEM`, `TASKS.TASK_TEMPLATES_LINK`, `PAYMENTS.PROJECT`, `MAINTENANCE.PROJECTS`, `PROJECTS.CLIENT`, and every other linked-record field returns a **`string[]`** (array of Airtable record IDs) from the API.

`str(val)` returns `undefined` when given an array — always use `strArr(val)[0]` to get the first record ID.

```ts
// WRONG — always undefined for linked fields:
const projectId = str(f[TASKS.PROJECT])

// CORRECT:
const projectId = strArr(f[TASKS.PROJECT])[0]  // first linked record ID
const allProjectIds = strArr(f[TASKS.PROJECT])  // full array
```

### 2. Writing linked-record fields — always use array format

Even with `typecast: true`, Airtable requires linked-record fields to be arrays:

```ts
// WRONG:
{ [TASKS.PROJECT]: projectId }

// CORRECT:
{ [TASKS.PROJECT]: [projectId] }
```

This applies to: `TASKS.PROJECT`, `TASKS.PROJECT_ITEM`, `TASKS.TASK_TEMPLATES_LINK`, `PROJECTS.CLIENT`, `PROJECTS.PARENT_PROJECT`, `PROJECTS.INSTALLATION_TEAM_MEMBERS`, `PAYMENTS.PROJECT`, etc.

### 3. `projectId` vs `id` on the Project type

| Property | Value | Use for |
|----------|-------|---------|
| `project.id` | `recXXXXXXXXXXXXXX` | All Airtable API calls (filter formulas, linked fields) |
| `project.projectId` | `3457r4` or WW-001 | Display only (human-readable) |

**`projectId` display logic** (`transformProject` in `_client.ts`):
```
quotationNumber + quotationReference → "3457r4"  (concatenated, no separator)
quotationNumber only               → "3457"
quotationReference only            → "r4"
neither                            → WW number (PROJECTS.PROJECT_ID field, legacy fallback)
```

The same rule is packaged as **`projectRefLabel()` in `lib/projectRef.ts`** — use it whenever building a display id from raw fields (task enrichment sets `task.projectRef` with it; calendar events, report cells, and email subjects go through it too). Raw `PROJECTS.PROJECT_ID` (WW number) is display-fallback only — never key logic on it.

### 4. Server components vs `'use client'`

- All `app/dashboard/*/page.tsx` files are **server components** — use `getSession()` (server-side)
- Any component with state, effects, or event handlers must have `'use client'` at the top
- Never use `useSession()` hook in a server component — use `getSession()` instead
- The pattern: server page fetches session → passes `role` prop to client component

### 5. `createTasksBatch` with `typecast: true`

`typecast: true` lets you pass select option names (strings) instead of their internal IDs, and linked-record primary field values instead of record IDs. It does NOT remove the requirement to pass arrays for `multipleRecordLinks` fields.

### 6. DocLinks and InstallationSchedule stored as JSON strings

`taskDocLinks`, `fillersDocLinks`, and `installationSchedule` are stored as JSON strings in singleLineText Airtable fields. When reading: use `parseDocLinks(val)`. When writing: `updateTask` serializes them automatically via the `DOC_LINK_KEYS` set.

### 7. Airtable formula linked-record comparisons

In Airtable formulas, `{PROJECT} = "recXXXXXXXXXXXXXX"` (comparing a linked-record field to a record ID) works — Airtable resolves it correctly. This is used throughout `tasks.ts` for filter formulas. Do not use primary-field-value comparisons for record ID lookups.

### 8. filterStalePhase1Tasks

Tasks with `templateOrder <= 18` (Phase 1 action range) are filtered out if their project is no longer in 'Preparing' stage. This prevents stale P1 tasks appearing in dashboards after the project advances. Applied in `getTasksByRole`.

### 9. `requireRole()` wraps the handler, returns the handler

```ts
// Route handler pattern:
export const POST = requireRole('manager', 'superadmin')(
  async (req: NextRequest, session: SessionPayload, { params }: { params: { id: string } }) => {
    // params is already resolved (no need to await)
    // session is guaranteed non-null and role-checked
  }
)
```

### 10. SED project visibility

SED users can only see projects where they are:
- The `SALES_OWNER` collaborator in Airtable (matched by Airtable member ID), OR
- Listed in `COMMUN_SEDS` (communal SEDs), OR
- Explicitly mapped in the `sed_projects` SQLite table (set at project creation and client request creation)

When a SED creates a project or client request, `addSedProjectMapping(userId, projectId)` is called to ensure visibility even if the Airtable collaborator sync hasn't run.

### 11. Calendar event aggregation

`getCalendarEvents()` aggregates from **four sources** into one list:
1. Tasks with `installationSchedule` (JSON) → events of type `installation`
2. Fabrication tasks with `plannedProdStartDate` → events of type `fabrication`
3. Payment records with `receivedDate` / `dueDate`
4. Custom `CALENDAR_EVENTS` records (created via `createCalendarEvent`)

Event type and team member IDs are encoded into the `CUSTOM_TASK` field as `type:{eventType}|team:{id1},{id2}`.
