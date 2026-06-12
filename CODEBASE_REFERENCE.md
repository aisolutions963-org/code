# Woodwings Codebase Reference

---

## How the System Works (Big Picture)

**Stack:** Next.js 16.2.6 + Airtable (primary database) + Turso / `@libsql/client` (sessions/metrics/notifications)

**Roles:** `sed` | `manager` | `fabrication` | `installation` | `superadmin`

**Data lives in Airtable.** All reads/writes go through `lib/airtable.ts`.
All business logic lives in `lib/workflow.ts`.
The Next.js API routes (`app/api/`) are thin wrappers: validate the request, call a function, return JSON.

---

## Auth & Session

- JWT stored in httpOnly cookie `ww_session` (24hr expiry, signed with `SESSION_SECRET` env var)
- **Users live in Turso (SQLite)**, NOT Airtable. Fields: `id, name, email, hashed_password (bcryptjs), role, active, airtable_member_id`
- `lib/auth.ts` — `getSession()` reads cookie → verifies JWT → returns `SessionPayload { id, name, email, role }`
- `lib/apiHandler.ts` — `requireRole(...roles)` wraps every protected route: validates session, checks role, resolves `params` from Next.js dynamic segments, calls handler
- Login flow: `POST /api/auth/login` → bcrypt compare → sign JWT → set cookie → redirect to `/dashboard/{role}`
- `lib/db.ts` — **fully async** Turso helpers (all functions return Promises):
  - Users CRUD: `getUserByEmail`, `getUserById`, `getAllUsers`, `getUsersByRole`, `createUser`, `updateUser`, `deleteUser`
  - Airtable sync: `getUserByAirtableMemberId`
  - SED access: `addSedProjectMapping`, `getSedProjectIdsByUserId`
  - Settings: `getSetting`, `setSetting` — **always `await` these**; missing await returns a Promise silently

---

## Roles & Permissions

### Role → Department mapping (`lib/permissions.ts`)

| Role | Sees tasks for departments |
|------|---------------------------|
| `installation` | Installation |
| `fabrication` | Fabrication, Installation |
| `sed` | SED, Fabrication, Installation |
| `manager` | Manager, Purchase, Mix, SED, Fabrication, Installation |
| `superadmin` | All |

### Field-level write permissions (`lib/permissions.ts` — `EDITABLE_FIELDS`)

- **installation**: status, teamDaysRequired, noOfLaborsPerDay, installationDays, completionDate, qcCheckAtSiteDone, fillersDone, doc links
- **fabrication**: status, fabricationPath, postCarpentryPath, plannedProdStartDate, expectedFabEndDate, doc links
- **sed**: status, postVisitOutcome, taskStartDate, conceptDesignApproval, sampleApproval, quotationOutcome, callCount, sedNote, followUpOutcome, doc links
- **manager**: status, managerReviewStatus, managerComment, completionDate, plannedProdStartDate, expectedFabEndDate, priorityFlag, requiresManagerReviewManually, doc links
- **superadmin**: all fields + `superadminNote` (handled separately — saves + notifies task departments)

`canEditField(role, fieldName)` — called before every PATCH
`filterAllowedFields(role, fields)` — strips unauthorized fields from request body

---

## Project Lifecycle (Stages)

```
Preparing → Open → Installation Completed → Closed & Valid Maintenance → Closed & Warranty Done
                ↘ Not-Approved (rejected)
```

| Stage | Template Orders | Notes |
|-------|----------------|-------|
| Preparing (Phase 1) | 1–22 | SED tasks: intake, quotation, sample, call client |
| Open (Phase 2) | 1–22 project-level, 23+ per-item | Generated after client approves call |
| Working (Phase 3) | 31–49 | Material ordering, fabrication, delivery |
| Closing (Phase 4) | — | Handover form, final payment — triggers when ALL per-item tasks done |

**Phase 4 trigger:** fires when every per-item task across all items is `Completed`. No task-name trigger.
`maybeGeneratePhase4` in `lib/workflow.ts`:
1. Checks `perItemTasks.every(t => t.status === 'Completed')`
2. Generates Phase 4 tasks (idempotent — checks `TASK_TEMPLATES_LINK` before creating)
3. **Independently** checks for existing maintenance record and creates one if absent — warranty clock always starts even if Phase 4 tasks were already generated

**Warranty flow:**
1. Phase 4 fires → `createMaintenanceRecord('Pending')` — startDate=today, endDate=today+1yr
2. Final payment → `activateMaintenanceRecord()` → project stage = `'Closed & Valid Maintenance'`
3. `GET /api/maintenance` auto-expires → `'Expired'` + stage = `'Closed & Warranty Done'`
4. `PATCH /api/maintenance` `{ recordId }` → manual expire

**Valid project stages:** `Preparing`, `Open`, `Not-Approved`, `Installation Completed`, `Closed`, `Closed & Valid Maintenance`, `Closed & Warranty Done`, `Archived`

Do NOT use "Fabrication" or "Installation" as stage values — those are department names.

---

## Task Statuses

```
Locked → To Do → In Progress → Pending Approval → Completed
```

- **Locked** = exists but hidden; waiting for prerequisite
- **To Do** = visible, can be started
- **Pending Approval** = completed by dept, waiting for manager sign-off
- **Completed** = done

---

## Template Order = Sequence Number

Every task has a `templateOrder` (integer). `unlockNextTasks` uses this to decide what to unlock next. Tasks at the **same order** are AND-joined — all must complete before the next order unlocks.

**Key Orders:**
| Order | Task |
|-------|------|
| 2 | First Call (auto-completes) |
| 4 | 6 parallel SED action tasks (each has a different `pathCondition`) |
| 5 | Branch tasks unlocked by each path-4 task |
| ~10–14 | `[GATE]` approval tasks (concept design, sample, quotation) |
| ~15 | Call the Client (unlocked only when ALL 3 gates pass) |
| 18 | Last Phase 1 task |
| 19–22 | Phase 2 project-level tasks |
| 24 | Per-item parallel action tasks |
| 25 | Per-item branch tasks |
| 26 | Per-item `[GATE]` tasks (sample + design approved) |
| 29 | Take Approval From Client to Start Fabrication (per item) |
| 31+ | Phase 3 (material, fabrication, delivery) |

---

## `pathCondition` — Parallel Paths

Phase 1 order-4 tasks run in parallel. Each has a unique `pathCondition` string. The workflow only advances tasks that share the same `pathCondition` (and null-path tasks are universal).

**Phase 1 paths (order 4):**
- `"Make Quotation"`
- `"Order Sample"`
- `"Visit Site to Gather Details"`
- `"Concept Design"`
- `"Site Measurements"`
- `"Send Existing Product Sample"`

**Phase 2 per-item paths (order 24):**
- `"Select Sample (item)"`
- `"Measurement (item)"`
- `"Design (item)"`
- `"Site Visit (item)"`

---

## Key Files

### `lib/workflow.ts` — All Business Logic

#### Internal (not exported):

**`unlockNextTasks(task)`**
The core sequencer. Called after any task completes. It:
1. Checks AND-join: are all sibling tasks at the same templateOrder done? If not, stops.
2. For per-item tasks: calls `maybeUnlockCallClient(projectId, itemId)` to check gates
3. Finds the next locked task in the same path above current order
4. Excludes `call the client` and `take approval from client` from regular chain (gate-only unlock)
5. Sets it to `To Do`; auto-completes `(auto)` tasks and triggers recursive chain

**`maybeUnlockCallClient(projectId, projectItemId?)`**
The gate resolver. Two modes:
- **No itemId (Phase 1):** Checks all `[gate]` tasks for project → if all Completed → unlocks "Call the Client"
- **With itemId (Phase 2):** Checks all `[gate]` tasks for that item → if all Completed → unlocks "Take Approval From Client to Start Fabrication" for that item

**`maybeGeneratePhase4(projectId)`**
- Checks all per-item tasks — if all Completed, generates Phase 4 tasks (idempotent)
- **Always** checks for maintenance record independently; creates one if missing
- Warranty clock starts here regardless of task generation state

#### Exported:

| Function | Trigger | What it does |
|----------|---------|--------------|
| `handleTaskCompletion(taskId, submittedBy?)` | PATCH status=Completed | Marks task Completed (or Pending Approval if manager review needed), calls `unlockNextTasks` |
| `handleManagerApproval(taskId)` | PATCH managerReviewStatus=Approved | Marks task Completed, calls `unlockNextTasks` |
| `handleManagerRejection(taskId)` | PATCH managerReviewStatus=Rejected | Resets task to To Do, notifies dept |
| `handleCallClientOutcome(taskId, outcome)` | POST /call-outcome | `'approved'` → advance to Phase 2; `'review'` → reset action tasks; `'refused'` → mark Not-Approved |
| `handleOrderSampleBranch(taskId, hasMaterial)` | POST /complete-branch | hasMaterial=true → Completed; false → In Progress. Unlocks matching "Sample Branch:" task for the right scope |
| `handleF3Order(input)` | POST /f3-order | Creates material order records, completes task |
| `handleCallCountEscalation(task)` | PATCH callCount >= 3 | Marks project Not-Approved, emails manager |

**Known bugs fixed:**
- `followUpOutcome = 'Reject Project'` now writes to `PROJECT_STAGE`, not `APPROVAL_STATUS` (was writing wrong field; rejected projects stayed visible)
- Phase 4 maintenance clock now runs independently of task generation (previously skipped if tasks already existed)

---

### `lib/airtable.ts` — Data Layer

#### URL helpers — CRITICAL, never mix:
```ts
recUrl(TABLE_ID, recordId)  // → PATCH a specific record
tblUrl(TABLE_ID)            // → GET/POST on a table
```

#### Task reads:
| Function | Returns |
|----------|---------|
| `getTaskById(id)` | Single task |
| `getTasksByRole(role, options?)` | Tasks filtered by dept, excludes Locked, sorted by priority+order |
| `getAllTasksForProject(projectId)` | All non-Locked tasks for project |
| `getAllTasksForProjectAll(projectId)` | ALL tasks including Locked (used by workflow engine) |
| `getLockedBranchTasksForProject(projectId)` | Locked tasks named "Sample Branch:..." for this project |
| `getIncompleteTasksForProject(projectId)` | Non-Completed tasks |

#### Task writes:
| Function | Notes |
|----------|-------|
| `updateTask(id, fields)` | Uses TaskUpdateInput schema (typed) |
| `updateTaskRaw(id, airtableFields)` | Raw field IDs — used internally by workflow |

#### Project:
| Function | Notes |
|----------|-------|
| `getProjects()` | Excludes all closed stages by default; fabrication/installation auto-filtered |
| `getAllProjects()` | All projects including closed |
| `getProjectById(id)` | Single project |
| `updateProject(id, fields)` | Raw field IDs |
| `createProject(input)` | Creates project + calls `getOrCreateClient()` |
| `deleteProjectById(id)` | Deletes project + all tasks |

#### Generation:
| Function | Notes |
|----------|-------|
| `generateTasksForProject(projectId, stage)` | Creates tasks from templates. For 'Open', only project-level (orders ≤ 22) |
| `generateItemTasksForProject(projectId)` | Per-item tasks (Phase 2, orders ≥ 23) |
| `generatePhase3TasksForItem(projectId, itemId)` | Phase 3 per-item tasks |
| `generatePhase4Tasks(projectId)` | Phase 4 project-level tasks (idempotent) |
| `checkAndUnlockCallClientTask(projectId)` | Legacy Phase 1 gate check — reads approval fields, unlocks "Call the Client" if all Approved |

#### Gate Passes:
| Function | Notes |
|----------|-------|
| `getGatePassesByProject(projectId)` | |
| `getAllGatePasses()` | |
| `createGatePass(input)` | |
| `updateGatePass(id, fields)` | Uses `recUrl()` — updatable: status, confirmedDeliveryDate, siteReady, clientNotified |

#### Maintenance:
| Function | Notes |
|----------|-------|
| `createMaintenanceRecord(status?)` | Default status = 'Pending'; sets 1-year window |
| `getMaintenanceRecordForProject(projectId)` | |
| `activateMaintenanceRecord(recordId)` | Sets status = 'Active'; triggers stage → 'Closed & Valid Maintenance' |
| `expireMaintenanceRecord(recordId)` | Sets status = 'Expired'; stage → 'Closed & Warranty Done' |
| `getMaintenanceRecords()` | All records (used by auto-expire route) |

#### Calendar:
| Function | Notes |
|----------|-------|
| `getCalendarEvents()` | |
| `createCalendarEvent(input)` | |
| `upsertF2DeliveryEvent(projectId, date)` | Idempotent delivery event |
| `upsertReminderEvent(key, title, notes?)` | Generalised idempotent upsert via `CUSTOM_TASK` field as key |

#### Clients:
`getAllClients()` — includes `projectCount`; used by `/api/clients` and SA Reports Clients tab

#### Payments:
`getPaymentsByProject`, `createPayment` — `POST /api/payments` enforces one non-cancelled Final payment per project (409 if duplicate)

---

### `lib/phases.ts` — Constants

```
PHASE_CONFIG.Preparing.universalActionOrderMax = 18   // last Phase 1 task order
PHASE_CONFIG.Open.projectLevelOrderMax = 22           // last project-level Phase 2 order
PHASE_CONFIG.Open.perItemOrderMin = 23                // first per-item task order

TASK_MARKERS.GATE_PREFIX = '[gate]'
TASK_MARKERS.CALL_CLIENT_PREFIX = 'call the client'
TASK_MARKERS.TAKE_APPROVAL_PREFIX = 'take approval from client'
TASK_MARKERS.AUTO_MARKER = '(auto)'
TASK_MARKERS.HEADLINE_PREFIX = 'to follow tasks progress'
```

No `triggerTaskPrefix` in Phase 4 — trigger is logic-based, not name-based.

---

### `lib/types.ts` — Key Types

**`Task`** — important fields:
```
id, taskName, status, department[], templateOrder[], pathCondition
project[]         — linked project record ID(s)
projectItem[]     — linked project item record ID(s); present only for per-item tasks
projectRecordId   — denormalized project record ID (for lookup)
projectId         — the human-readable project number (e.g. WW-045)
conceptDesignApproval / sampleApproval / quotationOutcome  — approval gate fields
superadminNote    — amber textarea visible to superadmin; read-only amber banner for all other roles
sedNote           — blue banner, SED-only write
```

**`TaskStatus`:** `'To Do' | 'In Progress' | 'Completed' | 'Locked' | 'Pending Approval'`

**`Role`:** `'sed' | 'manager' | 'fabrication' | 'installation' | 'superadmin'`

**`Project`:** `id, projectId, projectName, projectStage, quotationNumber, quotationReference, projectItemIds[]`

---

## API Routes

### Auth
| Route | Method | Notes |
|-------|--------|-------|
| `/api/auth/login` | POST | |
| `/api/auth/logout` | POST | |

### Tasks

| Route | Method | Role | Calls |
|-------|--------|------|-------|
| `/api/tasks` | GET | any | `getTasksByRole` |
| `/api/tasks/pending-approvals` | GET | manager/superadmin | Pending approval count |
| `/api/tasks/[id]` | GET | any | `getTaskById` |
| `/api/tasks/[id]` | PATCH | any | `handleTaskCompletion` / `handleManagerApproval` / `handleManagerRejection` / `checkAndUnlockCallClientTask`; `superadminNote` handled separately |
| `/api/tasks/[id]/complete-branch` | POST | sed/manager/superadmin | `handleOrderSampleBranch` |
| `/api/tasks/[id]/call-outcome` | POST | superadmin | `handleCallClientOutcome` |
| `/api/tasks/[id]/f3-order` | POST | manager/superadmin | `handleF3Order` |
| `/api/workflow/unlock` | POST | manager/superadmin | Manual unlock |

### Projects

| Route | Method | Role | Does |
|-------|--------|------|------|
| `/api/projects` | GET | any | Role-filtered project list |
| `/api/projects` | POST | sed/manager/superadmin | Create project |
| `/api/projects/[id]` | GET | any | Returns project + tasks + payments |
| `/api/projects/[id]` | PATCH | sed/manager/superadmin | Updates quotation number or manager notes |
| `/api/projects/[id]` | DELETE | superadmin | Deletes project + all tasks |
| `/api/projects/[id]/generate-tasks` | POST | manager/superadmin | Calls `generateTasksForProject` |
| `/api/projects/[id]/quotation` | GET/POST | sed/manager/superadmin | F5 quotation items + generates per-item tasks |
| `/api/projects/[id]/items` | POST | any | Create project item |
| `/api/projects/[id]/items/[itemId]` | POST | any | Update item |
| `/api/projects/[id]/items-progress` | GET | any | Items with task progress summary |
| `/api/projects/[id]/materials` | POST | any | Create materials |
| `/api/projects/[id]/purchase-orders` | POST | any | Create PO |
| `/api/projects/[id]/installation-logs` | POST | any | Log installation work |
| `/api/projects/[id]/assign-installation` | POST | manager/superadmin | Assign team → `INSTALLATION_TEAM_MEMBERS` |
| `/api/projects/[id]/advance` | POST | manager/superadmin | Stage advance |
| `/api/projects/[id]/reopen` | POST | manager/superadmin | Reopen closed project |
| `/api/projects/[id]/disapprove` | POST | manager/superadmin | Reject project |
| `/api/projects/[id]/handover` | POST | manager/superadmin | Handover workflow |
| `/api/projects/[id]/request-measurement` | POST | manager/superadmin | |
| `/api/projects/[id]/inactivity-check` | POST | any | |

### Gate Passes
| Route | Method | Role | Notes |
|-------|--------|------|-------|
| `/api/gate-passes` | GET | any | |
| `/api/gate-passes` | POST | manager/superadmin | |
| `/api/gate-passes/[id]` | PATCH | manager/superadmin | Updates: `gatePassStatus`, `confirmedDeliveryDate`, `siteReady`, `clientNotified` |

### Payments & Maintenance
| Route | Method | Notes |
|-------|--------|-------|
| `/api/payments` | POST | Duplicate Final guard — 409 if non-cancelled Final already exists |
| `/api/maintenance` | GET | Auto-expires maintenance records past `endDate` |
| `/api/maintenance` | PATCH | Manual expire `{ recordId }` |

### Materials
| Route | Method |
|-------|--------|
| `/api/materials` | POST |
| `/api/materials/[id]` | PATCH |

### Users & Team
| Route | Method | Role |
|-------|--------|------|
| `/api/users` | GET, POST | superadmin |
| `/api/users/[id]` | PATCH, DELETE | superadmin |
| `/api/workers` | GET, POST | superadmin |
| `/api/workers/[id]` | PATCH, DELETE | superadmin |
| `/api/team/sed` | GET | any |
| `/api/team/installation` | GET | any |

### Notifications & Comms
| Route | Method | Notes |
|-------|--------|-------|
| `/api/notifications` | GET | Role-scoped list |
| `/api/notifications` | PATCH | Mark all read |
| `/api/notifications/[id]` | PATCH | Mark one read |
| `/api/announcements` | POST | |
| `/api/announcements/[id]` | PATCH, DELETE | |

### Timesheets
| Route | Method |
|-------|--------|
| `/api/timesheets` | GET, POST |
| `/api/timesheets/[id]` | PATCH, DELETE |
| `/api/timesheets/summary` | GET |
| `/api/timesheets/workers` | GET |

### Clients & Settings
| Route | Method | Notes |
|-------|--------|-------|
| `/api/clients` | GET | All authenticated roles; lazy-loaded in `NewProjectModal` |
| `/api/settings` | GET, POST | Always `await getSetting/setSetting` — Turso is async |

### Calendar & Cron
| Route | Method | Notes |
|-------|--------|-------|
| `/api/calendar` | POST | Create calendar event |
| `/api/cron/weekly-reminder` | GET | Fri: notifications + upsert calendar event; Sat: notifications only |
| `/api/cron/monthly-audit` | GET | Reminders + calendar event; idempotency key `monthly-audit:YYYY-MM` |

### Reports (all GET → Excel download)
```
/api/reports/download/projects-by-stage
/api/reports/download/ongoing-projects
/api/reports/download/client-projects          ?clientName=
/api/reports/download/sed-projects
/api/reports/download/quotations
/api/reports/download/quotation-line-items
/api/reports/download/material-orders
/api/reports/download/payables
/api/reports/download/receivables
/api/reports/download/follow-ups
/api/reports/download/timesheets
```

### Superadmin Analytics
| Route | Method |
|-------|--------|
| `/api/superadmin/metrics` | GET |
| `/api/superadmin/kpi-counts` | GET |
| `/api/superadmin/sed-stats` | GET |
| `/api/superadmin/team-tasks` | GET |
| `/api/superadmin/timeline` | GET |

### System
| Route | Method | Notes |
|-------|--------|-------|
| `/api/health` | GET | Public health check |
| `/api/admin/health` | GET | Admin only |
| `/api/admin/logs` | GET | |
| `/api/admin/replay/[id]` | POST | Replay failed request |
| `/api/debug/projects` | GET | |

---

## Components

### `TaskCard.tsx` — Single task card

**Task-type flags (boolean, derived from task data):**
```
isMakeQuotation      — pathCondition='Make Quotation' OR name includes 'make quotation'
isF4Task             — name starts with 'F4 —'
isF3Task             — name starts with 'F3 —' OR includes 'order material'
isOrderSample        — name = 'Order Sample' AND no projectItem (project-level only)
isPerItemOrderSample — has projectItem AND pathCondition = 'Select Sample (item)'
isDecisionTask       — superadmin viewing 'Call the Client' task (shows 3-outcome panel)
```

**What each type renders:**
| Flag | Special UI |
|------|-----------|
| `isDecisionTask` | 3 buttons: Approved / Needs Review / Rejected. Nothing else. |
| `isMakeQuotation` | Quotation number + reference inputs; "Save & Complete" button |
| `isF4Task` | Same quotation inputs; read-only if quotation already recorded |
| `isOrderSample` or `isPerItemOrderSample` | Green "We Have It" / Orange "Need to Order" buttons |
| `isF3Task` | Path selector (Small/Big) + material order table |
| Default | Instructions, status badge, editable fields per role |

**Superadmin note:**
- `superadminNote` field (`TASKS.SUPERADMIN_NOTE = fldjVNPzFB76Ik0fh`) — amber textarea in `FieldEditor.tsx`
- Shown as amber read-only banner in `TaskCard` for non-superadmin roles

**Key handlers:**
- `handleChange(key, value)` — intercepts status changes for special task types
- `completeOrderSampleBranch(hasMaterial)` → POST `/complete-branch`
- `saveQuotationAndComplete()` → PATCH project quotation, then PATCH task status=Completed
- `handleF3Submit()` → POST `/f3-order`

### `TaskList.tsx` — List of tasks

**Props:** `tasks`, `role`, `onUpdate`, `groupByProject` (default true)

- `groupByProject=true` → groups by project, renders `ProjectTaskCard` per group
- `groupByProject=false` → flat list, renders `TaskCard` for each task directly

### `ProjectTaskCard.tsx`
Navigation card for a project group. Clicking goes to `/dashboard/project/[projectRecordId]`.
Shows: project ref, stage, task count, pending approval count.

### `ItemProgressCard.tsx`
Card for a single project item showing step progress dots and status.
`onSelect()` prop — clicking the whole card selects the item (shows Level 3 task list).

### `ItemBoard.tsx`
Renders the per-item section of a project page.
- Default: grid of `ItemProgressCard`s
- When item selected: shows that item's task list (Level 3 view) with back button

### `GatePassModal.tsx`
4-section form: transport/driver, shipment/items, delivery/customer, pass metadata (validity + time).
Auto-generates pass serial from Airtable record name (`gatePass.name`).
Print: calls `triggerPrint()` from `lib/printGatePass.ts` — full-screen overlay, no iframes/popups.

---

## How to Tell Me What to Change

Use these terms:

- **"workflow function"** → edit `lib/workflow.ts`
- **"airtable function"** → edit `lib/airtable.ts`
- **"task card"** → edit `components/tasks/TaskCard.tsx`
- **"task list"** → edit `components/tasks/TaskList.tsx`
- **"PATCH route"** / **"task API"** → edit `app/api/tasks/[id]/route.ts`
- **"template order N"** → the task at that sequence number
- **"gate check"** → `maybeUnlockCallClient` or `checkAndUnlockCallClientTask`
- **"unlock chain"** → `unlockNextTasks`
- **"per-item task"** → task with `projectItem` set (order 23+)
- **"project-level task"** → task without `projectItem` (order ≤ 22)
- **"phase 1"** → Preparing stage tasks
- **"phase 2"** → Open stage tasks

---

## Airtable Tables (`lib/fieldMap.ts`)

Base ID: from env var `AIRTABLE_BASE_ID`

| Constant | Table ID | Purpose |
|----------|----------|---------|
| TASKS | tblOGEvAGcieHMPeX | All task instances (52 fields) |
| PROJECTS | tblNYJQt2YWSWxzHP | Project master records |
| PROJECT_ITEMS | tblWg3ijuhV1JsijY | Items within each project |
| TASK_TEMPLATES | tblfJFDNd2dcY1rUk | Blueprint definitions for task generation |
| QUOTATIONS | tbllITZymuWCZ9tde | Quotation line items |
| PAYMENTS | tblTrLUuGRGt5iSwD | Payment records |
| CLIENTS | tblRDICf8jQOOvQPf | Client master data |
| TEAM_MEMBERS | tbleyX0MkYf1OucMS | App users directory (name, role, email, active) |
| GATE_PASSES | see fieldMap | Delivery gate passes |
| MATERIALS_NEEDED | see fieldMap | Material requisitions |
| HANDOVER_SHEETS | see fieldMap | Project handover records |
| PURCHASE_ORDERS | see fieldMap | PO records |
| INSTALLATION_LOGS | see fieldMap | Site work logs |
| ANNOUNCEMENTS | see fieldMap | System-wide announcements |
| CALENDAR_EVENTS | see fieldMap | Installation/delivery/reminder calendar events |
| MAINTENANCE | see fieldMap | Warranty tracking — Pending → Active → Expired |
| PRODUCTION_TIMESHEETS | see fieldMap | Daily worker timesheet entries |
| WORKERS | see fieldMap | Worker directory for timesheets |
| SYSTEM_LOGS | see fieldMap | Structured error/event log |
| FAILED_REQUESTS | see fieldMap | Failed requests queued for replay |

**Key PROJECTS fields:**
- `ASSIGNED_INSTALLATION_TEAM` (`fldXdHwEqZLdgBgy4`) — `multipleCollaborators`, **not used for assignment** (requires Airtable user IDs)
- `INSTALLATION_TEAM_MEMBERS` (`fldi1aJVJ94RBk6lP`) — `multipleRecordLinks` → TEAM_MEMBERS, **used for team assignment**
- `PROJECT_STAGE` (`fldnINS8WLH5nkNGK`)

**Key TASKS fields:**
- `STATUS` (`fldZxo3damMz00LZI`)
- `TEMPLATE_ORDER` — integer, drives sequencing
- `PATH_CONDITION` — string, groups parallel paths
- `PLANNED_PROD_START_DATE`, `EXPECTED_FAB_END_DATE` — fabrication date range
- `SUPERADMIN_NOTE` (`fldjVNPzFB76Ik0fh`) — amber note, superadmin-only write

**Key CALENDAR_EVENTS fields:**
- `CUSTOM_TASK` — used as idempotency key in `upsertReminderEvent()` and `upsertF2DeliveryEvent()`

---

## Dashboard Pages

| Route | Role | Key views / features |
|-------|------|---------------------|
| `/dashboard/sed` | sed | Tasks, Approvals, Site Visits, QC, Projects (New Project, F5 quotation, F3 material order) |
| `/dashboard/fab` | fabrication | Tasks, Materials (fab dates), Timeline (production schedule) |
| `/dashboard/fix` | installation | Tasks only |
| `/dashboard/mgr` | manager | Tasks, Deliveries, Projects (F5/F3/F6-handover/gate-pass/team-assign), Payments, Calendar, Installation |
| `/dashboard/superadmin` | superadmin | All of the above + Reports (Clients tab, Excel downloads), Users, Metrics, Calendar |
| `/dashboard/project/[id]` | all | Project detail: tasks, items, payments, gate passes, installation logs |
| `/dashboard/pipeline` | manager/superadmin | Pipeline stage view |
| `/dashboard/notifications` | all | Notification inbox |
| `/dashboard/forms` | manager/superadmin | Gate pass creation (standalone GatePassModal with project picker) |
| `/dashboard/superadmin/users` | superadmin | User management |
| `/dashboard/superadmin/workers` | superadmin | Worker management |
| `/dashboard/superadmin/timesheets` | superadmin | Timesheet review |
| `/dashboard/superadmin/team-activity` | superadmin | Activity log |

---

## Task Panels (`components/tasks/panels/`)

| Panel | Shown when | What it does |
|-------|-----------|--------------|
| `QuotationPanel` | `pathCondition='Make Quotation'` | Enters quotation number + reference; saves to project, then completes task |
| `F5QuotationPanel` | task name starts `'F4 —'` | Same inputs but for advance payment recording |
| `OrderSamplePanel` | name=`'Order Sample'`, no `projectItem` | "We Have It" → completes; "Need to Order" → unlocks order branch |
| `F3OrderPanel` | task name starts `'F3 —'` | Small/Big order selector + material table; POST `/f3-order` |
| `AttachDocsPanel` | Phase 3 per-item final step | 7 document link inputs (Material List, Final Design, MEP, Site Photo, Site Size, Logistics, Sample) |
| `ChooseInstallTeamPanel` | team assignment task | Fetches from `/api/team/installation`; PATCH `/api/projects/[id]/assign-installation` with record IDs → `INSTALLATION_TEAM_MEMBERS` field |
| `F2ProductionPanel` | Fabrication date entry task | Arabic UI; enters `plannedProdStartDate` + `expectedFabEndDate` |
| `F2DeliveryPanel` | F2 delivery scheduling | |
| `CallClientDecisionPanel` | Call the Client task | 3-outcome panel (Approved / Review / Refused) |
| `FixingTeamNotePanel` | Installation team notes | |
| `FabricateMissingPanel` | Fabrication missing items | |

---

## State Management

**Client data fetching:** SWR (`swr` package)
```typescript
const { data, mutate } = useSWR('/api/tasks?role=sed', fetcher, {
  refreshInterval: 30000,
  revalidateOnFocus: true,
})
// After a mutation: call mutate() to refresh
```

**Local UI state:** React `useState` — modals, selections, loading flags

**Session context:** `lib/session-context.tsx` — `useSession()` returns `{ role, name, id }`

**Drawer context:** `lib/drawer-context.tsx` — `useDrawer()` → `openDrawer(title, content)` / `closeDrawer()`. Rendered once at layout level by `ContextDrawer.tsx` (right-side slide-in panel).

**Server-side cache:** `lib/cache.ts` — LRU cache for Airtable responses

---

## Notifications & Email

**In-app notifications:** Turso `notifications` table
`lib/notifications.ts` — `createNotification({ userId?, role?, title, message })` — broadcasts to all users with a given role if `role` is provided. All functions are async.

**Email:** Resend (`lib/email.ts`), sender `notifications@woodwings.ae`
Triggered by:
- Task → Pending Approval → email manager
- `callCount` reaches 3 → escalation email to manager
- F4 completion → accountant email via `notifyAccountantEvent()`
- Visit site task date set → manager notification
- Manager rejection → dept notification

Required env vars: `MANAGER_EMAIL`, `RESEND_API_KEY`

---

## Scheduled Cron (GitHub Actions)

File: `.github/workflows/cron-reminders.yml`
Vercel Cron removed — `vercel.json` is empty.

| Schedule | UTC | UAE | Route |
|---|---|---|---|
| Fri reminder | 04:00 | 08:00 | `/api/cron/weekly-reminder` — notifications + upsert weekly review calendar event |
| Sat follow-up | 05:00 | 09:00 | `/api/cron/weekly-reminder` — notifications only |
| Monthly audit | 1st 04:00 | 1st 08:00 | `/api/cron/monthly-audit` — reminders + monthly audit calendar event |

Required GitHub secrets: `APP_URL`, `CRON_SECRET`
Manual dispatch available via GitHub Actions tab.

---

## Environment Variables

| Var | Notes |
|-----|-------|
| `SESSION_SECRET` | 32+ chars, JWT signing |
| `AIRTABLE_BASE_ID` | |
| `AIRTABLE_API_KEY` | |
| `TURSO_URL` | Production Turso DB URL |
| `TURSO_AUTH_TOKEN` | Production Turso auth token |
| `RESEND_API_KEY` | |
| `MANAGER_EMAIL` | Default manager email |
| `NEXT_PUBLIC_APP_NAME` | Shown in UI |
| `CRON_SECRET` | Bearer token for GitHub Actions → cron endpoints |
| `APP_URL` | Deployment URL used by cron curl calls |

---

## Key Patterns & Gotchas

- **All db calls must be awaited** — `lib/db.ts` is fully async (Turso). Missing `await` silently returns a Promise, e.g. `getSetting()` without await caused accountant emails to never fire.
- **`recUrl` vs `tblUrl`** — never mix. PATCH a record = `recUrl`. POST/GET on table = `tblUrl`.
- **`getProjects()` excludes closed stages by default** — includes `Closed & Valid Maintenance` and `Closed & Warranty Done` in the exclusion formula.
- **`SALES_OWNER` is an array** — always read as `array[0]`, not a direct object. Affects SED stats, reports, and project ownership matching.
- **Final payment is gated** — only one non-cancelled Final payment per project. 409 if duplicate.
- **`superadminNote`** handled separately in `PATCH /api/tasks/[id]` — not merged with regular field updates.
- **Phase 3 + Phase 4 generation are idempotent** — both check `TASK_TEMPLATES_LINK` before creating tasks.
- **`/api/clients` is lazy-loaded** in `NewProjectModal` — only fetches on focus/type to conserve Airtable quota.
- **Reject Project** writes to `PROJECT_STAGE`, not `APPROVAL_STATUS` (old bug was writing the wrong field).

---

## Recent Changes (2026-06-07 → 2026-06-08)

**Staging Turso migration** — `lib/db.ts` rewritten for `@libsql/client` async; added `getUsersByRole`, `getUserByAirtableMemberId`, `addSedProjectMapping`, `getSedProjectIdsByUserId`; all API routes updated to await db calls.

**Workflow bug fixes:**
1. Reject Project now writes `PROJECT_STAGE` (was writing `APPROVAL_STATUS`)
2. `maybeGeneratePhase4` maintenance clock now runs independently of task generation state

**Cron reminders:**
- Weekly reminder upserts a calendar event on Friday (Saturday stays notification-only)
- New monthly audit route (`/api/cron/monthly-audit`) — creates reminders + calendar event
- `upsertReminderEvent()` added to `lib/airtable.ts`

**Settings await fix** — `getSetting`/`setSetting` in `/api/settings/route.ts` were missing `await`; accountant email was never readable/writable.

**Cron moved to GitHub Actions** — Vercel Hobby plan caps at 2 cron jobs; `.github/workflows/cron-reminders.yml` replaces all Vercel cron entries.

**Previous session (2026-06-07):**
- Gate Pass redesign — 4-section form, `PATCH /api/gate-passes/[id]`, print overlay via `triggerPrint()`
- Maintenance/warranty flow — Phase 4 creates Pending record, Final payment activates, auto-expires after 1 year
- Phase 4 trigger rewrite — all-items guard, idempotent generation
- Superadmin follow-up note — `TASKS.SUPERADMIN_NOTE = fldjVNPzFB76Ik0fh`, amber UI
- Client system — autocomplete in `NewProjectModal`, SA Reports Clients tab, per-client Excel
- Payment duplicate Final guard
- `app/not-found.tsx`, `app/error.tsx` created; dead components (`TopBar`, `Sidebar`) deleted

**Previous session (2026-06-04):**
- `fabricationActive` on `Project` — computed via `getFabricationActiveProjectIds()`; used by `ProjectPipeline` to show project in "Production" stage
- `INSTALLATION_TEAM_MEMBERS` (`fldi1aJVJ94RBk6lP`, `multipleRecordLinks` → TEAM_MEMBERS) — `assignInstallationTeam()` writes to this field; old `ASSIGNED_INSTALLATION_TEAM` (`fldXdHwEqZLdgBgy4`) is unused
- Calendar fabrication ranges — `getCalendarEvents()` emits range events; `MiniCalendar` renders `bg-emerald-50` range days
