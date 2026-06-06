# Woodwings Codebase Reference

---

## How the System Works (Big Picture)

**Stack:** Next.js 14 + Airtable (database) + SQLite (sessions/metrics)

**Roles:** `sed` | `manager` | `fabrication` | `installation` | `superadmin`

**Data lives in Airtable.** All reads/writes go through `lib/airtable.ts`.
All business logic lives in `lib/workflow.ts`.
The Next.js API routes (`app/api/`) are thin wrappers: validate the request, call a function, return JSON.

---

## Auth & Session

- JWT stored in httpOnly cookie `ww_session` (24hr expiry, signed with `SESSION_SECRET` env var)
- **Users live in SQLite** (`/data/users.db`), NOT Airtable. Fields: `id, name, email, hashed_password (bcryptjs), role, active, airtable_member_id`
- `lib/auth.ts` — `getSession()` reads cookie → verifies JWT → returns `SessionPayload { id, name, email, role }`
- `lib/apiHandler.ts` — `requireRole(...roles)` wraps every protected route: validates session, checks role, resolves `params` from Next.js dynamic segments, calls handler
- Login flow: `POST /api/auth/login` → bcrypt compare → sign JWT → set cookie → redirect to `/dashboard/{role}`
- `lib/db.ts` — SQLite helpers: users CRUD, notifications table, metrics snapshots table

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
- **superadmin**: all fields

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

**Phase 4 trigger:** fires when every per-item task across all items is `Completed`. No task-name trigger. On Phase 4 generation, a maintenance record is created with `status = 'Pending'` (warranty clock starts). On final payment, status becomes `Active` and project stage → `Closed & Valid Maintenance`. After 1 year, stage → `Closed & Warranty Done`.

**Valid project stages:** `Preparing`, `Open`, `Not-Approved`, `Installation Completed`, `Closed`, `Closed & Valid Maintenance`, `Closed & Warranty Done`, `Archived`

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

#### Exported:

| Function | Trigger | What it does |
|----------|---------|--------------|
| `handleTaskCompletion(taskId, submittedBy?)` | PATCH status=Completed | Marks task Completed (or Pending Approval if manager review needed), calls `unlockNextTasks` |
| `handleManagerApproval(taskId)` | PATCH managerReviewStatus=Approved | Marks task Completed, calls `unlockNextTasks` |
| `handleManagerRejection(taskId)` | PATCH managerReviewStatus=Rejected | Resets task to To Do, notifies dept |
| `handleCallClientOutcome(taskId, outcome)` | POST /call-outcome | 'approved' → advance to Phase 2; 'review' → reset action tasks; 'refused' → mark Not-Approved |
| `handleOrderSampleBranch(taskId, hasMaterial)` | POST /complete-branch | hasMaterial=true → Completed; false → In Progress. Unlocks matching "Sample Branch:" task for the right scope (project-level or per-item by projectItem) |
| `handleF3Order(input)` | POST /f3-order | Creates material order records, completes task |
| `handleCallCountEscalation(task)` | PATCH callCount >= 3 | Marks project Not-Approved, emails manager |

---

### `lib/airtable.ts` — Data Layer

#### Task reads:
| Function | Returns |
|----------|---------|
| `getTaskById(id)` | Single task |
| `getTasksByRole(role, options?)` | Tasks filtered by dept, excludes Locked, sorted by priority+order |
| `getAllTasksForProject(projectId)` | All non-Locked tasks for project |
| `getAllTasksForProjectAll(projectId)` | ALL tasks including Locked (used by workflow engine) |
| `getLockedBranchTasksForProject(projectId)` | Locked tasks named "Sample Branch:..." for this project |

#### Task writes:
| Function | Notes |
|----------|-------|
| `updateTask(id, fields)` | Uses TaskUpdateInput schema (typed) |
| `updateTaskRaw(id, airtableFields)` | Raw field IDs — used internally by workflow |

#### Project:
| Function | Notes |
|----------|-------|
| `getProjectById(id)` | Single project |
| `updateProject(id, fields)` | Raw field IDs |

#### Generation:
| Function | Notes |
|----------|-------|
| `generateTasksForProject(projectId, stage)` | Creates tasks from templates for a stage. For 'Open', only creates project-level (orders ≤ 22); per-item (orders ≥ 23) created separately on F5 submission |
| `checkAndUnlockCallClientTask(projectId)` | **Legacy Phase 1 gate check** — reads approval fields (`conceptDesignApproval`, `sampleApproval`, `quotationOutcome`) from `[GATE]` tasks; unlocks "Call the Client" if all Approved. Triggered by PATCH route when approval fields change |

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
```

**`TaskStatus`:** `'To Do' | 'In Progress' | 'Completed' | 'Locked' | 'Pending Approval'`

**`Role`:** `'sed' | 'manager' | 'fabrication' | 'installation' | 'superadmin'`

**`Project`:** `id, projectId, projectName, projectStage, quotationNumber, quotationReference, projectItemIds[]`

---

## API Routes

### Tasks

| Route | Method | Role | Calls |
|-------|--------|------|-------|
| `/api/tasks` | GET | any | `getTasksByRole` |
| `/api/tasks/[id]` | GET | any | `getTaskById` |
| `/api/tasks/[id]` | PATCH | any | `handleTaskCompletion` / `handleManagerApproval` / `handleManagerRejection` / `checkAndUnlockCallClientTask` |
| `/api/tasks/[id]/complete-branch` | POST | sed/manager/superadmin | `handleOrderSampleBranch` |
| `/api/tasks/[id]/call-outcome` | POST | superadmin | `handleCallClientOutcome` |
| `/api/tasks/[id]/f3-order` | POST | manager/superadmin | `handleF3Order` |

### Projects

| Route | Method | Role | Does |
|-------|--------|------|------|
| `/api/projects/[id]` | GET | any | Returns project + tasks + payments |
| `/api/projects/[id]` | PATCH | sed/manager/superadmin | Updates quotation number or manager notes |
| `/api/projects/[id]` | DELETE | superadmin | Deletes project + all tasks |
| `/api/projects/[id]/generate-tasks` | POST | manager/superadmin | Calls `generateTasksForProject` |
| `/api/projects/[id]/quotation` | POST | sed/manager/superadmin | Submits F5 quotation items + generates per-item tasks |
| `/api/projects/[id]/items-progress` | GET | any | Returns items with task progress summary |

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
| CALENDAR_EVENTS | see fieldMap | Installation/delivery calendar events |

**Key PROJECTS fields:**
- `ASSIGNED_INSTALLATION_TEAM` (`fldXdHwEqZLdgBgy4`) — `multipleCollaborators`, **not used for assignment** (requires Airtable user IDs)
- `INSTALLATION_TEAM_MEMBERS` (`fldi1aJVJ94RBk6lP`) — `multipleRecordLinks` → TEAM_MEMBERS, **used for team assignment**
- `PROJECT_STAGE` (`fldnINS8WLH5nkNGK`)

**Key TASKS fields:**
- `STATUS` (`fldZxo3damMz00LZI`)
- `TEMPLATE_ORDER` — integer, drives sequencing
- `PATH_CONDITION` — string, groups parallel paths
- `PLANNED_PROD_START_DATE`, `EXPECTED_FAB_END_DATE` — fabrication date range

---

## Dashboard Pages

| Route | Role | Key views / features |
|-------|------|---------------------|
| `/dashboard/sed` | sed | Tasks, Approvals, Site Visits, QC, Projects (New Project, F5 quotation, F3 material order) |
| `/dashboard/fab` | fabrication | Tasks, Materials (fab dates), Timeline (production schedule) |
| `/dashboard/fix` | installation | Tasks only |
| `/dashboard/mgr` | manager | Tasks, Deliveries, Projects (F5/F3/F6-handover/gate-pass/team-assign), Payments, Calendar, Installation |
| `/dashboard/superadmin` | superadmin | All of the above + system config |
| `/dashboard/project/[id]` | all | Project detail: tasks, items, payments, gate passes, installation logs |
| `/home` | all | Pipeline (project stage grouping), Installation & Delivery calendar, team activity |

**Home page special features:**
- `ProjectPipeline` — groups active projects by stage; projects with `fabricationActive=true` appear in "Production" stage regardless of their Airtable `projectStage`
- `MiniCalendar` (`type="installation"`) — fabrication date ranges as soft green cell highlights; delivery events as yellow dots; activity events show a detail popover on click

---

## Task Panels (`components/tasks/panels/`)

| Panel | Shown when | What it does |
|-------|-----------|--------------|
| `QuotationPanel` | `pathCondition='Make Quotation'` | Enters quotation number + reference; saves to project, then completes task |
| `F4QuotationPanel` | task name starts `'F4 —'` | Same inputs but for advance payment recording |
| `OrderSamplePanel` | name=`'Order Sample'`, no `projectItem` | "We Have It" → completes; "Need to Order" → unlocks order branch |
| `PerItemOrderSamplePanel` | `pathCondition='Select Sample (item)'` + `projectItem` | Same two-button, scoped per item |
| `F3OrderPanel` | task name starts `'F3 —'` | Small/Big order selector + material table; POST `/f3-order` |
| `AttachDocsPanel` | Phase 3 per-item final step | 7 document link inputs (Material List, Final Design, MEP, Site Photo, Site Size, Logistics, Sample) |
| `ChooseInstallTeamPanel` | team assignment task | Fetches from `/api/team/installation`; PATCH `/api/projects/[id]/assign-installation` with record IDs → `INSTALLATION_TEAM_MEMBERS` field |
| `F2ProductionPanel` | Fabrication date entry task | Arabic UI; enters `plannedProdStartDate` + `expectedFabEndDate` |

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

**In-app notifications:** SQLite `notifications` table
`lib/notifications.ts` — `createNotification({ userId?, role?, title, message })` — broadcasts to all users with a given role if `role` is provided

**Email:** Resend (`lib/email.ts`), sender `notifications@woodwings.ae`
Triggered by:
- Task → Pending Approval → email manager
- `callCount` reaches 3 → escalation email to manager
- F4 completion → accountant email
- Visit site task date set → manager notification
- Manager rejection → dept notification

Required env vars: `MANAGER_EMAIL`, `RESEND_API_KEY`

---

## Recent / Notable Changes

**`fabricationActive` on `Project`**
- Computed server-side in `getProjects()` / `getAllProjects()` via `getFabricationActiveProjectIds()`
- `true` when any task for that project is in the Fabrication department AND not Locked/Completed
- Used by home page `ProjectPipeline` to override stage and show project in "Production"

**`INSTALLATION_TEAM_MEMBERS` field**
- Added `PROJECTS.INSTALLATION_TEAM_MEMBERS = 'fldi1aJVJ94RBk6lP'` (`multipleRecordLinks` → TEAM_MEMBERS)
- `transformProject` reads `assignedInstallationTeam` from this field
- `assignInstallationTeam()` writes TEAM_MEMBERS record IDs to this field
- Old `ASSIGNED_INSTALLATION_TEAM` field (`fldXdHwEqZLdgBgy4`, `multipleCollaborators`) is now **unused**

**Calendar fabrication ranges**
- `getCalendarEvents()` emits one range event per fabrication task: `{ date: startDate, endDate: expectedFabEndDate, type: 'fabrication' }`
- `MiniCalendar` renders range days as `bg-emerald-50` (not dots); start/end days get rounded corners
