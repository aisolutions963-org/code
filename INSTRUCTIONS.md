# Do Not Touch — Stable Finished Parts

These parts of the codebase are complete, tested, and working correctly. Do not refactor, restructure, or modify them unless there is a specific confirmed bug. Each section explains what it does and why it must stay as-is.

---

## 1. Field Map — `lib/fieldMap.ts`

All Airtable table IDs and field IDs live here. Every field ID is a hard-coded string like `fldXXXXXXXXXXXXXX`. These are the actual IDs from the live Airtable base.

**Do not:**
- Rename or reorder the constants
- Add placeholder or guessed field IDs
- Change a field ID without first verifying it in Airtable

If a field ID is wrong, every read and write for that field silently fails.

---

## 2. Phase Configuration — `lib/phases.ts`

Defines the order boundaries for each workflow phase:

```
PHASE_CONFIG = {
  Open: {
    projectLevelOrderMax: 22,   // orders ≤ 22 are project-level Phase 2 tasks
    perItemOrderMin: 23,         // orders ≥ 23 are per-item tasks
    phaseLabel: 'Phase 2 — Opening',
  },
  Working: { perItemOrderMin: 31, phaseLabel: 'Phase 3 — Working' },
  Closing: { phaseLabel: 'Phase 4 — Closing' },
}
```

**Do not change these numbers.** The task generation functions (`generateItemTasksForProject`, `generatePhase3TasksForItem`, `generatePhase4Tasks`) and the ItemBoard display logic all depend on these exact thresholds. Changing them will break which tasks appear where.

---

## 3. Core Airtable Layer — `lib/airtable.ts`

### Transform functions
`transformTask`, `transformProject`, `transformProjectItem`, `transformQuotation`, etc. — these convert raw Airtable records into typed objects the app uses. They are carefully mapped to the field IDs in `fieldMap.ts`.

**Do not:**
- Add or remove fields from these functions without a matching field in Airtable
- Change how `strArr`, `lookupStrArr`, `lookupNumArr`, `selectName`, `lookupSelectNames` work — these handle Airtable's different return formats (linked records, lookups, selects)

### Task generation functions — **critical workflow logic**
These functions create tasks from templates in Airtable. They implement the entire phase-based workflow:

| Function | Phase | What it creates |
|---|---|---|
| `generateTasksForProject(projectId, stage)` | Phase 1, 2, 3 project-level | Project-level tasks when a project moves stage |
| `generateItemTasksForProject(projectId, itemId, chosenPaths)` | Phase 2 per-item | Per-item branch tasks after F5 submission |
| `generatePhase3TasksForItem(projectId, itemId)` | Phase 3 per-item | Production tasks per item |
| `generatePhase4Tasks(projectId)` | Phase 4 | Closing/handover tasks |

The `pathMinMap` logic inside these functions ensures only the **first task in each path starts as "To Do"** — everything else starts as "Locked". This is intentional and must stay.

### `checkAndUnlockCallClientTask`
Gate-checking logic that unlocks the "Call Client" task only after at least one path task is completed. This prevents users from skipping the entire workflow.

### `fetchAll` / `fetchWithRetry` / rate limiting
The Airtable API has rate limits. `fetchWithRetry` handles retries with backoff. `fetchAll` paginates through large result sets. Do not replace these with bare `fetch()` calls.

---

## 4. Auth System — `lib/auth.ts` + `lib/db.ts`

SQLite-based session auth. Sessions are stored server-side (not in cookies/JWTs). `getSession()` is called at the top of every API route to verify the user.

**Do not:**
- Bypass `getSession()` checks
- Add new roles without updating `ROLE_TO_DEPARTMENT` in `lib/airtable.ts` and the role enum in `lib/validation.ts`
- Touch the password hashing logic

---

## 5. Validation Schemas — `lib/validation.ts`

Zod schemas guard every API route's input. They are the single source of truth for what shape data must be.

**Rules:**
- Every API route that accepts a body must parse it through a schema before touching any data
- When adding a new required field to a schema, update **all** callers (forms, panels, other API routes) at the same time — a required field that a form doesn't send will cause silent 400 errors

Currently stable schemas (do not change their existing fields):
- `LoginSchema`, `CreateUserSchema`, `UpdateUserSchema`
- `UpdateTaskSchema`
- `CreatePaymentSchema`
- `CreateAnnouncementSchema`
- `AssignInstallationSchema`
- `CreateHandoverSchema`
- `CreatePurchaseOrderSchema`
- `CreateInstallationLogSchema`
- `CreateMaterialOrderSchema`

---

## 6. Notification System — `lib/notifications.ts`

Push notifications are sent via SQLite + a server-sent events (SSE) stream. `notifyTasksReady`, `notifyUser`, and `notifyRole` write to SQLite; the SSE endpoint streams them to the browser.

**Do not:**
- Call notification functions in fire-and-forget patterns inside API routes — wrap them in `try/catch` so a notification failure never breaks the main operation
- Add blocking `await` on notifications in the critical path of a user-facing action

---

## 7. Established Task Panels — `components/tasks/panels/`

These panels are complete and working. Do not restructure their props interface or submission logic:

| Panel | Task it handles |
|---|---|
| `QuotationPanel.tsx` | `variant="makeQuotation"` (Make Quotation R0/R1/R2) and `variant="f4"` (Advance Payment) |
| `F3OrderPanel.tsx` | F3 — Material Order |
| `F2ProductionPanel.tsx` | F2 — Production Schedule |
| `F2DeliveryPanel.tsx` | F2 — Schedule Delivery |
| `AttachDocsPanel.tsx` | Attach 7 documents before fabrication |
| `ChooseInstallTeamPanel.tsx` | Choose installation team |
| `FixingTeamNotePanel.tsx` | Installation day logs |
| `OrderSamplePanel.tsx` | Order Sample (project-level and per-item) |
| `FabricateMissingPanel.tsx` | Fabricate missing items |
| `CallClientDecisionPanel.tsx` | Call client — outcome decision |

Each panel receives `task` and `onUpdate` props. The `onUpdate` call is what marks the task Completed — it must always be called **after** any data has been saved, never before.

---

## 8. TaskCard Detection Logic — `components/tasks/TaskCard.tsx`

The block of `isMakeQuotation`, `isF4Task`, `isF5Task`, `isF3Task`, `isOrderSample`, etc. flags near the top of `TaskCard` controls which panel renders and which completion guards fire. This detection is based on task names and `pathCondition` values that match the actual Airtable templates.

**Do not:**
- Change the string matching without also renaming the templates in Airtable
- Remove completion guards (the `toast.error` blocks before status changes) — they exist to prevent tasks being marked Done before their form is filled

---

## 9. pathCondition Values

`pathCondition` is a select field in Airtable. The string values used in code must exactly match the option names configured in the Airtable base. The currently active values are:

**Phase 1 paths (project-level):**
`"Visit Site to Gather Details"`, `"Select Material / Order Samples"`, `"Make Quotation"`, `"Assign Installation for Measurement"`, `"Draft Proposal or Photo Ideas"`, `"Client Clarifications & Sketches"`

**Phase 2 paths (per-item):**
`"Site Visit (item)"`, `"Select Sample (item)"`, `"Design (item)"`, `"Measurement (item)"`

If these strings ever need to change, they must be updated simultaneously in: the Airtable base select options, `lib/airtable.ts` (any hardcoded references), `lib/validation.ts` (the `actions` enum in `CreateQuotationItemsSchema`), and `F5QuotationPanel.tsx`.

---

## 10. Items-Progress Pipeline

The chain that makes per-item cards appear on the project detail page:

```
F5 submitted
  → POST /api/projects/[id]/quotation
    → createProjectItem()          — creates the item record in Airtable
    → createQuotation()            — creates quotation record
    → generateItemTasksForProject() — creates tasks linked to the item (MUST be awaited)
  → onUpdate(task.id, { status: 'Completed' })
    → handleUpdate() in project page
      → mutate()                   — re-fetches /api/projects/[id]/items-progress
        → getAllTasksForProjectAll() — fetches all tasks for the project
        → filters tasks where projectItem is set
        → groups by item ID
        → returns item summaries
          → ItemBoard renders item cards
```

`generateItemTasksForProject` **must be awaited**, not fire-and-forget. If it runs after the API returns, `mutate()` will fetch before the tasks exist and items won't appear.

---

## 12. Branch Strategy — Database Compatibility

The codebase has two active branches with different database setups. **Never merge the db layer from `testing` into `main`.**

| Branch | Database | API style | Purpose |
|---|---|---|---|
| `main` | Turso (`@libsql/client`) | Async (`await`) | Production — deployed on Vercel |
| `testing` | `better-sqlite3` (local file) | Sync | Local development and feature work |

### When merging `testing` → `main`

These files will **always conflict** and you must **keep `main`'s version** every time:
- `lib/db.ts`
- `lib/notifications.ts`
- `lib/metricsSnapshot.ts`
- `lib/auth.ts`
- `lib/email.ts`
- `lib/workflow.ts`
- `package.json` / `package-lock.json`
- Any API route that imports from `lib/db` or `lib/notifications`

Everything else (UI components, new pages, new API routes that don't use db functions directly) can be taken from `testing` without conflict.

### When adding new db-dependent features on `testing`

If a new route or function uses db functions (e.g. `getUserById`, `getAllUsers`, `getSetting`), remember that on `main` these are async. When the code reaches `main`, all calls need `await`. Plan for this during the merge.

---

## 11. SWR Data Fetching Pattern

Every dashboard uses SWR for data fetching with a 30-second refresh interval. After any mutation (task update, form submission), the relevant `mutate()` function must be called explicitly — SWR does not automatically know data changed.

The project detail page (`app/dashboard/project/[id]/page.tsx`) has **two** SWR hooks that must both be mutated after task updates:
- `mutate()` → refreshes `/api/projects/${id}/items-progress` (item cards)
- `mutateTasks()` → refreshes `/api/tasks?projectId=${id}` (project task list)

The SED and Manager dashboards only mutate their own task list — they have no items-progress SWR. Item cards only exist on the project detail page.
