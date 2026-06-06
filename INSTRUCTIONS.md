# Do Not Touch — Stable Finished Parts

These parts of the codebase are complete, tested, and working correctly. Do not refactor, restructure, or modify them unless there is a specific confirmed bug.

---

## 1. Field Map — `lib/fieldMap.ts`

All Airtable table IDs and field IDs live here. Every field ID is a hard-coded string like `fldXXXXXXXXXXXXXX`. These are the actual IDs from the live Airtable base.

**Do not:**
- Rename or reorder the constants
- Add placeholder or guessed field IDs
- Change a field ID without first verifying it in Airtable

If a field ID is wrong, every read and write for that field silently fails.

**Important:** When writing record-level PATCH calls in `lib/airtable.ts`, always use `recUrl(TABLE_ID, recordId)` — NOT `tblUrl(TABLE_ID) + '/' + recordId`. `tblUrl()` appends a query string that corrupts the URL when a record ID is appended after it.

---

## 2. Phase Configuration — `lib/phases.ts`

```typescript
PHASE_CONFIG = {
  Preparing: { universalActionOrderMin: 3, universalActionOrderMax: 18 },
  Open:      { phaseLabel: 'Phase 2 — Opening', projectLevelOrderMax: 22, perItemOrderMin: 23 },
  Working:   { phaseLabel: 'Phase 3 — Working', triggerOrder: 29, perItemOrderMin: 30 },
  Closing:   { phaseLabel: 'Phase 4 — Closing' },
                // Phase 4 triggers when ALL per-item tasks are Completed
                // (no triggerTaskPrefix — that was removed)
}
```

**Do not change these numbers.** The task generation functions and display logic all depend on these exact thresholds.

**Phase 4 trigger (important change):** Phase 4 no longer fires when a task named "handing over form" completes. It now fires when **all per-item tasks across all items are Completed**. `maybeGeneratePhase4()` in `lib/workflow.ts` checks this before calling `generatePhase4Tasks()`. The "Handing Over Form" task is now a **Phase 4 template** (not Phase 3).

---

## 3. Core Airtable Layer — `lib/airtable.ts`

### Transform functions
`transformTask`, `transformProject`, `transformProjectItem`, etc. convert raw Airtable records into typed objects. Do not change how `strArr`, `lookupStrArr`, `selectName`, etc. work.

### URL construction rule
- **Table-level operations** (POST to create, GET list): use `tblUrl(TABLE_ID)`
- **Record-level operations** (PATCH, DELETE on a specific record): use `recUrl(TABLE_ID, recordId)`

Mixing these breaks the Airtable API silently.

### Task generation functions — critical workflow logic

| Function | Phase | What it creates |
|---|---|---|
| `generateTasksForProject(projectId, stage)` | Phase 1, 2, 3 project-level | Project-level tasks when a project moves stage |
| `generateItemTasksForProject(projectId, itemId, chosenPaths)` | Phase 2 per-item | Per-item branch tasks after F5 submission |
| `generatePhase3TasksForItem(projectId, itemId)` | Phase 3 per-item | Production tasks per item — **idempotent** |
| `generatePhase4Tasks(projectId)` | Phase 4 | Closing/handover tasks — **idempotent** |

Both Phase 3 and Phase 4 generation are idempotent: they check which templates already have task records before creating anything.

### Gate pass operations

`updateGatePass(id, updates)` — exported function for record-level PATCH on gate passes. Uses `recUrl()`.

### Maintenance record operations

- `createMaintenanceRecord(projectId, { startDate, endDate, status? })` — status defaults to `'Active'`; pass `'Pending'` at Phase 4 generation
- `getMaintenanceRecordForProject(projectId)` — fetches the first maintenance record for a project
- `activateMaintenanceRecord(recordId)` — sets status to `'Active'` on final payment
- `expireMaintenanceRecord(recordId)` — sets status to `'Expired'` when warranty ends

All use `recUrl()` for PATCH calls.

### `fetchAll` / `fetchWithRetry` / rate limiting
The Airtable API has rate limits. Do not replace with bare `fetch()` calls.

---

## 4. Auth System — `lib/auth.ts` + `lib/db.ts`

JWT-based sessions (24h), stored in httpOnly cookie `ww_session`. `getSession()` is called at the top of every API route.

**Do not:**
- Bypass `getSession()` checks
- Add new roles without updating `ROLE_TO_DEPARTMENT` in `lib/airtable.ts` and the role enum in `lib/validation.ts`
- Touch the password hashing logic

---

## 5. Validation Schemas — `lib/validation.ts`

Zod schemas guard every API route's input. Every API route that accepts a body must parse it through a schema.

Currently stable schemas (do not change existing fields without updating all callers):
- `LoginSchema`, `CreateUserSchema`, `UpdateUserSchema`
- `UpdateTaskSchema` — includes `superadminNote?: string` (max 2000)
- `CreatePaymentSchema`
- `CreateAnnouncementSchema`
- `AssignInstallationSchema`
- `CreateHandoverSchema`
- `CreatePurchaseOrderSchema`
- `CreateInstallationLogSchema`
- `CreateMaterialOrderSchema`

---

## 6. Notification System — `lib/notifications.ts`

`createNotification()` is fire-and-forget sync (SQLite). It logs errors with context but never throws — a notification failure must never block the main operation.

**Do not:**
- Add blocking `await` on notifications in the critical path of a user-facing action
- Assume a notification was delivered — it may fail silently

---

## 7. Established Task Panels — `components/tasks/panels/`

| Panel | Task it handles |
|---|---|
| `QuotationPanel.tsx` | `variant="makeQuotation"` and `variant="f4"` (Advance Payment) |
| `F3OrderPanel.tsx` | F3 — Material Order |
| `F2ProductionPanel.tsx` | F2 — Production Schedule |
| `F2DeliveryPanel.tsx` | F2 — Schedule Delivery |
| `AttachDocsPanel.tsx` | Attach 7 documents |
| `ChooseInstallTeamPanel.tsx` | Choose installation team |
| `FixingTeamNotePanel.tsx` | Installation day logs (Arabic UI) |
| `OrderSamplePanel.tsx` | Order Sample |
| `FabricateMissingPanel.tsx` | Fabricate missing items |
| `CallClientDecisionPanel.tsx` | Call client — outcome decision |

`onUpdate` must always be called **after** data is saved, never before.

---

## 8. TaskCard Detection Logic — `components/tasks/TaskCard.tsx`

`isMakeQuotation`, `isF4Task`, `isF5Task`, etc. flags control which panel renders. Based on task names and `pathCondition` that match Airtable templates.

**Superadmin note display:** When `task.superadminNote` is set and `role !== 'superadmin'`, an amber banner shows the note read-only. Superadmin edits it via FieldEditor (amber textarea).

**SED note display:** When `task.sedNote` is set and `role === 'manager' || 'superadmin'`, a blue banner shows it read-only.

---

## 9. pathCondition Values

String values must exactly match Airtable select option names.

**Phase 1 paths:** `"Visit Site to Gather Details"`, `"Select Material / Order Samples"`, `"Make Quotation"`, `"Assign Installation for Measurement"`, `"Draft Proposal or Photo Ideas"`, `"Client Clarifications & Sketches"`

**Phase 2 paths:** `"Site Visit (item)"`, `"Select Sample (item)"`, `"Design (item)"`, `"Measurement (item)"`

---

## 10. Items-Progress Pipeline

```
F5 submitted
  → createProjectItem() → createQuotation() → generateItemTasksForProject()  ← must be awaited
  → onUpdate(task.id, { status: 'Completed' })
    → mutate() → re-fetches /api/projects/[id]/items-progress
```

`generateItemTasksForProject` **must be awaited**, not fire-and-forget.

---

## 11. SWR Data Fetching Pattern

After any mutation, call `mutate()` explicitly. The project detail page has two SWR hooks that must both be mutated after task updates:
- `mutate()` → refreshes `/api/projects/${id}/items-progress`
- `mutateTasks()` → refreshes `/api/tasks?projectId=${id}`

---

## 12. Branch Strategy — Database Compatibility

| Branch | Database | API style | Purpose |
|---|---|---|---|
| `main` | Turso (`@libsql/client`) | Async (`await`) | Production on Vercel |
| `testing` | `better-sqlite3` (local file) | Sync | Local development |

When merging `testing` → `main`, **always keep `main`'s version** of:
- `lib/db.ts`, `lib/notifications.ts`, `lib/metricsSnapshot.ts`, `lib/auth.ts`, `lib/email.ts`, `lib/workflow.ts`
- `package.json` / `package-lock.json`

New db-dependent features added on `testing` need `await` added to all db calls when reaching `main`.

---

## 13. Warranty / Maintenance Flow

**Do not change the order of these steps:**

1. **Phase 4 generates** (`maybeGeneratePhase4` in `lib/workflow.ts`): creates maintenance record with `status = 'Pending'`, `startDate = today`, `endDate = today + 1 year`. Warranty clock starts here.
2. **Final payment received** (`closeProjectAfterFinalPayment` in `app/api/payments/route.ts`): finds the pending maintenance record → calls `activateMaintenanceRecord()` → updates project stage to `'Closed & Valid Maintenance'` → notifies accountant.
3. **1 year later** (`GET /api/maintenance` auto-expire): if `Active` records have `endDate < today`, calls `expireMaintenanceRecord()` + updates project stage to `'Closed & Warranty Done'`.

**Valid project stages (full list):** `Preparing`, `Open`, `Not-Approved`, `Installation Completed`, `Closed`, `Closed & Valid Maintenance`, `Closed & Warranty Done`, `Archived`

Do not use "Fabrication" or "Installation" as project stage values — those are department names, not stages.

---

## 14. Gate Pass Lifecycle

- **Create**: `POST /api/gate-passes` (manager/superadmin only)
- **Update status**: `PATCH /api/gate-passes/[id]` — allowed fields: `gatePassStatus`, `confirmedDeliveryDate`, `siteReady`, `clientNotified`
- **Print**: uses `triggerPrint()` from `lib/printGatePass.ts` — injects a full-screen overlay into the current page, calls `window.print()`
- Valid status values: `Pending`, `Delivered`, `Cancelled`

---

## 15. Payment Guard

A second `Final` payment for the same project is blocked at the API level (HTTP 409). Check for this in UI — if the user tries to record a second Final payment and gets a 409, show them the error message from the response body.

---

## 16. Client Autocomplete in NewProjectModal

`/api/clients` is lazy-loaded — it only fetches when the user focuses/types in the Client Name field. Do not change it to eager load (it would run on every modal open and waste Airtable API quota).

---

## 17. Print Utility — `lib/printGatePass.ts`

`triggerPrint(data: GatePassPrintData)` creates a full-screen white overlay (`position:fixed; inset:0`) with the gate pass document. The overlay has Print and Close buttons. `@media print` hides the buttons so only the document prints. This approach works without any popup windows, blob URLs, or iframes — all of which were blocked in previous attempts.
