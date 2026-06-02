# Woodwings Codebase Guide
### A beginner-friendly explanation of how everything works

---

## Table of Contents
1. [What is this app?](#1-what-is-this-app)
2. [The big picture — how the pieces fit](#2-the-big-picture)
3. [Folder structure](#3-folder-structure)
4. [The two databases](#4-the-two-databases)
5. [Roles — who can do what](#5-roles)
6. [How a page loads (the request journey)](#6-how-a-page-loads)
7. [The most important files explained](#7-most-important-files)
8. [The workflow engine — how tasks unlock](#8-the-workflow-engine)
9. [The notification system](#9-the-notification-system)
10. [Key API routes cheat sheet](#10-api-routes-cheat-sheet)
11. [How forms and panels work](#11-how-forms-and-panels-work)
12. [Phase generation — how phases auto-start](#12-phase-generation)

---

## 1. What is this app?

This is a **project management system** built for a wood/carpentry business (UAE market — AED currency, Arabic support). Think of it like a digital operations manual.

When a client orders custom furniture or woodwork, the business goes through a series of steps:
- SED (sales) takes the order and creates a quote
- Manager approves and assigns work
- Fabrication team builds it
- Installation team installs it at the client's site
- Handover happens, final payment is recorded, and the project closes

Each of these steps is a **task**. This app tracks all tasks across all projects, makes sure they happen in the right order, and shows each team only what they need to see.

---

## 2. The big picture

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                                │
│   Each role sees their own dashboard (SED, Manager, etc.)    │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP requests
┌────────────────────────▼─────────────────────────────────────┐
│                   NEXT.JS SERVER                              │
│                                                               │
│  app/api/...       ← API routes (the "backend")              │
│  app/dashboard/... ← Pages (the "frontend")                  │
│  lib/              ← Business logic shared by both           │
└──────────┬──────────────────────┬────────────────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼──────────────────────────┐
│     AIRTABLE        │  │           SQLITE                   │
│ (main data store)   │  │ (users, notifications, settings)   │
│                     │  │                                    │
│ - Projects          │  │ - Who can log in                   │
│ - Tasks             │  │ - Notification history             │
│ - Payments          │  │ - Project-user mappings            │
│ - Materials         │  │ - App settings (accountant email)  │
│ - Gate passes       │  │                                    │
│ - Quotations        │  │  file: data/users.db               │
│ - Installation logs │  └────────────────────────────────────┘
│ - Timesheets        │
│ - Calendar events   │
│ - etc.              │
└─────────────────────┘
```

**In plain English:**
- The user opens the app in their browser
- The browser talks to the Next.js server
- The server reads/writes data from Airtable (the main database) and SQLite (user accounts and notifications)
- The server sends back a response that the browser shows on screen

---

## 3. Folder structure

```
woodwings/
│
├── app/                    ← All pages and API endpoints
│   ├── api/                ← Backend: handles data requests
│   │   ├── tasks/          ← Task CRUD + F3-order sub-route
│   │   ├── projects/       ← Project CRUD + sub-routes:
│   │   │   └── [id]/
│   │   │       ├── quotation/         ← F5 quotation items
│   │   │       ├── materials/         ← Material orders
│   │   │       ├── handover/          ← Handover sheet submit
│   │   │       ├── assign-installation/ ← Pick installation team
│   │   │       ├── items-progress/    ← Per-item phase progress
│   │   │       └── generate-tasks/    ← Superadmin task seeding
│   │   ├── payments/       ← Payment recording
│   │   ├── installation-logs/ ← Per-day installation log
│   │   ├── notifications/  ← Bell count + mark-read
│   │   ├── settings/       ← Accountant email setting
│   │   ├── team/           ← Team member management
│   │   └── ...
│   │
│   └── dashboard/          ← Frontend: what users see
│       ├── sed/            ← SED role dashboard
│       ├── mgr/            ← Manager dashboard
│       ├── fab/            ← Fabrication dashboard
│       ├── fix/            ← Installation/fixing dashboard
│       ├── superadmin/     ← Admin panel
│       ├── notifications/  ← Full notifications list (all roles)
│       └── project/[id]/   ← Individual project page
│
├── components/             ← Reusable UI pieces
│   ├── tasks/              ← Task cards and panels
│   │   └── panels/         ← Per-task-type action panels
│   ├── projects/           ← Project cards and forms
│   │   ├── HandoverModal.tsx
│   │   ├── ItemBoard.tsx
│   │   └── ProjectFormsSection.tsx
│   ├── calendar/           ← Calendar components
│   └── layout/             ← Sidebar, top bar, navigation
│
├── lib/                    ← Core logic (the "brain")
│   ├── airtable.ts         ← All Airtable read/write operations
│   ├── db.ts               ← SQLite user management
│   ├── workflow.ts         ← Task unlock engine
│   ├── phases.ts           ← Phase config constants (PHASE_CONFIG)
│   ├── permissions.ts      ← Who can edit what
│   ├── types.ts            ← Data shape definitions
│   ├── auth.ts             ← Login/logout/sessions
│   ├── notifications.ts    ← In-app notifications
│   ├── validation.ts       ← Zod schemas for API inputs
│   └── fieldMap.ts         ← Airtable field ID constants
│
└── data/
    └── users.db            ← SQLite database file
```

---

## 4. The two databases

### Airtable — the main database
Airtable is like a fancy spreadsheet in the cloud. It holds all the business data:
- Projects and their details
- Tasks and their statuses
- Payments
- Materials
- Gate passes
- Quotation items
- Installation logs (daily on-site work records)
- Timesheets
- Calendar events

Every table in Airtable has a **Table ID** (like `tblXXXXXX`) and every column has a **Field ID** (like `fldXXXXXX`). These IDs are stored in `lib/fieldMap.ts` as constants so we never have to type them from memory.

```typescript
// lib/fieldMap.ts — example
export const TASKS = {
  TABLE_ID: 'tblOGEvAGcieHMPeX',
  TASK_NAME: 'fldSomeId',
  STATUS: 'fldAnotherId',
  // etc.
}
```

All reading and writing to Airtable goes through `lib/airtable.ts`.

### SQLite — the local user database
SQLite is a simple database stored as a file (`data/users.db`) directly on the server. It holds:
- **User accounts** (name, email, hashed password, role)
- **Notifications** (alerts for each role/user)
- **Settings** (like the accountant's email)
- **SED project mappings** (which SED user created which project)

SQLite is managed in `lib/db.ts`.

**Why two databases?**
Airtable is great for business data that non-developers can also view and edit. SQLite is better for fast, simple lookups like "is this password correct?" and things that don't belong in Airtable.

---

## 5. Roles

The app has 5 user roles. Each role sees a different dashboard and can only edit certain fields on tasks.

| Role | Dashboard | What they do |
|------|-----------|-------------|
| `sed` | `/dashboard/sed` | Sales, client contact, quotations, F4/F5 forms |
| `manager` | `/dashboard/mgr` | Approvals, payments, oversight of all tasks |
| `fabrication` | `/dashboard/fab` | Production scheduling, material orders (F3) |
| `installation` | `/dashboard/fix` | On-site installation, day logs, handovers |
| `superadmin` | `/dashboard/superadmin` | Everything — user management, reports, full access |

**How permissions work:**
Each role can only edit specific fields on a task. For example:
- Fabrication can set `fabricationPath` and `plannedProdStartDate`
- SED can set `postVisitOutcome` and `conceptDesignApproval`
- Installation can set `installationDays` and `qcCheckAtSiteDone`

This is defined in `lib/permissions.ts`:
```typescript
export const EDITABLE_FIELDS = {
  installation: ['status', 'installationDays', 'qcCheckAtSiteDone', ...],
  fabrication:  ['status', 'fabricationPath', 'plannedProdStartDate', ...],
  sed:          ['status', 'postVisitOutcome', 'conceptDesignApproval', ...],
  manager:      ['status', 'managerReviewStatus', 'managerComment', ...],
  superadmin:   [...all fields...],
}
```

---

## 6. How a page loads

Let's trace what happens when a manager opens their dashboard:

```
1. Browser requests: GET /dashboard/mgr

2. Next.js checks: is the user logged in?
   └── reads the ww_session cookie
   └── verifies the JWT token (lib/auth.ts → getSession())
   └── if no session → redirect to /login

3. Page component loads (app/dashboard/mgr/page.tsx)
   └── calls useSWR('/api/tasks', ...) in the browser
   └── calls useSWR('/api/projects', ...) in the browser

4. Browser sends: GET /api/tasks
   └── app/api/tasks/route.ts handles it
   └── checks session again (requireRole())
   └── calls getTasksByRole('manager', ...) in lib/airtable.ts
   └── airtable.ts sends a request to Airtable API with a filter formula
   └── Airtable returns matching task records
   └── airtable.ts transforms raw records into clean Task objects
   └── API returns JSON: { tasks: [...] }

5. Browser receives the JSON
   └── React re-renders the page with the task data
   └── User sees their tasks
```

---

## 7. Most important files

### `lib/airtable.ts` — The data layer

This is the biggest and most important file. It contains every function that reads or writes data to Airtable. Nothing else talks to Airtable directly — everything goes through here.

**Key functions:**

```typescript
// Get all tasks for a role (e.g., all manager tasks)
getTasksByRole(role, { projectId?, sedProjectIds? })

// Get a single task by its Airtable record ID
getTaskById(id)

// Update a task's fields
updateTask(id, fields)

// Get all projects
getProjects({ stage?, sedAirtableMemberId?, sedEmail? })

// Get a single project
getProjectById(id)

// Create a new project
createProject(data)

// Generate the starter tasks for a project phase
generateTasksForProject(projectId, phase)

// Generate Phase 3 tasks for a specific item (called by workflow engine)
// Idempotent: skips templates already created for the item
// Sequential: lowest-order task = To Do, rest = Locked
generatePhase3TasksForItem(projectId, itemId)

// Generate Phase 4 closing tasks for the whole project
generatePhase4Tasks(projectId)

// Get items (sub-jobs) for a project
getProjectItemsForProject(projectId)

// Record a payment
createPayment(input)

// Get all payments for a project
getPaymentsByProject(projectId)

// Get all materials needed for a project
getMaterialsByProject(projectId)

// Assign installation team to a project
assignInstallationTeam(projectId, teamMemberIds, opts?: { itemName?, itemId? })

// Record daily installation work
createInstallationLog(input)
getInstallationLogsByProject(projectId)

// Handover and maintenance
createHandoverSheet(projectId, data)
getHandoverSheetForProject(projectId)
createMaintenanceRecord(projectId, handoverDate)

// Calendar events
getCalendarEvents()
createCalendarEvent(input)
upsertF2DeliveryEvent(input)  // auto-creates/updates delivery event when F2 is set

// Timesheets
getTimesheetEntries(filters)
createTimesheetEntry(input)
```

**How it reads from Airtable:**
Every read uses `fetchAll()` which sends a GET request to the Airtable REST API. The response is an array of raw records. Each record gets passed through a `transform` function that converts it from Airtable's raw format to a clean TypeScript object.

```typescript
// Raw Airtable record (messy)
{ id: 'recXXX', fields: { 'fldABC123': 'To Do', 'fldDEF456': 'Buy materials' } }

// After transformTask() — clean and readable
{ id: 'recXXX', status: 'To Do', taskName: 'Buy materials' }
```

---

### `lib/workflow.ts` — The task unlock engine

This is the "brain" that decides which tasks become available next. When you complete a task, the workflow engine figures out what to unlock.

**The basic idea:**
Tasks in Airtable start as `Locked`. They only become `To Do` (available) when their prerequisites are done. The workflow engine checks conditions and flips tasks from `Locked` → `To Do`.

**Key functions:**

```typescript
// Main function — called every time a task is completed
handleTaskCompletion(taskId, fields, session)

// Unlocks the next tasks in sequence after one is completed
unlockNextTasks(task)

// Checks if the 3 gate tasks are done, unlocks "Call Client"
maybeUnlockCallClient(projectId, projectItemId?)

// Auto-generates Phase 3 tasks when task at triggerOrder=29 completes
// (one call per item — only generates tasks not yet created for that item)
maybeGeneratePhase3(task)

// Auto-generates Phase 4 tasks when the Handover Form task completes
maybeGeneratePhase4(task)

// Handles manager approval (approve → Completed → unlock chain continues)
handleManagerApproval(taskId, action, comment, session)
```

**How task ordering works:**
Each task has a `templateOrder` number. Tasks with a lower number must complete before higher-numbered tasks unlock. Some tasks are in "AND groups" — all tasks in the group must complete before anything after them unlocks.

---

### `lib/phases.ts` — Phase configuration

Central config for all four project phases. Every phase-boundary number lives here — never hardcode them in workflow.ts or airtable.ts.

```typescript
export const PHASE_CONFIG = {
  Preparing: {
    universalActionOrderMin: 3,
    universalActionOrderMax: 18,
  },
  Open: {
    phaseLabel: 'Phase 2 — Opening',
    projectLevelOrderMax: 22,
    perItemOrderMin: 23,
  },
  Working: {
    phaseLabel: 'Phase 3 — Working',
    triggerOrder: 29,        // completing this order triggers Phase 3 generation
    perItemOrderMin: 30,
  },
  Closing: {
    phaseLabel: 'Phase 4 — Closing',
    triggerTaskPrefix: 'handing over form',  // task name prefix that triggers Phase 4
  },
}
```

---

### `lib/auth.ts` — Login and sessions

Handles who is logged in. Uses JWT (JSON Web Tokens) — a signed token stored in a browser cookie.

```typescript
// Create a session token after successful login
createSession(user) → returns JWT string

// Read the current user's session from the cookie
getSession() → returns { id, name, email, role } or null

// Verify a JWT token is valid and not expired
verifySession(token) → returns session payload

// Set the cookie in the browser
setSessionCookie(token)

// Delete the cookie (logout)
clearSessionCookie()
```

**How login works:**
1. User submits email + password
2. `getUserByEmail()` finds the user in SQLite
3. `verifyPassword()` checks the bcrypt hash
4. `createSession()` creates a JWT with user info, valid for 8 hours
5. `setSessionCookie()` saves it in the browser as an HTTP-only cookie
6. Every subsequent request reads the cookie with `getSession()`

---

### `lib/permissions.ts` — Access control

Two main exports:

```typescript
// Can this role edit this field?
canEditField(role, fieldName) → boolean

// Remove fields this role can't touch from an update request
filterAllowedFields(role, fields) → filtered fields object

// Which Airtable departments does this role see tasks from?
ROLE_TO_DEPARTMENT = {
  'sed':          ['SED', 'Fabrication', 'Installation'],
  'fabrication':  ['Fabrication', 'Installation'],
  'installation': ['Installation'],
  'manager':      ['Manager', 'Purchase', 'Mix', 'SED', 'Fabrication', 'Installation'],
}
```

The `ROLE_TO_DEPARTMENT` mapping is important: when a manager requests their tasks, they see tasks from ALL departments. When fabrication requests tasks, they only see Fabrication and Installation tasks.

---

### `lib/db.ts` — User management (SQLite)

All SQLite operations. Simpler than airtable.ts.

```typescript
// Find a user by email (used for login)
getUserByEmail(email) → DBUser | undefined

// Find a user by their ID number
getUserById(id) → DBUser | undefined

// Find a user by their Airtable member ID (usrXXXX format)
getUserByAirtableMemberId(memberId) → DBUser | undefined

// Create a new user account
createUser({ name, email, hashed_password, role, airtable_member_id })

// Update user fields (name, role, active status, etc.)
updateUser(id, fields)

// Soft-delete (sets active = 0, not a real delete)
deleteUser(id)

// Record which project a SED user created
addSedProjectMapping(projectAirtableId, userId)

// Get all project IDs a SED user created
getSedProjectIdsByUserId(userId) → string[]
```

---

### `lib/types.ts` — Data shapes

Defines the TypeScript interfaces — basically the "shape" of every data object in the app.

**Most important:**

```typescript
// A task in the workflow
interface Task {
  id: string                    // Airtable record ID
  taskName: string              // e.g. "F3 — Order Materials"
  status: 'To Do' | 'In Progress' | 'Completed' | 'Locked' | 'Pending Approval'
  department: string[]          // Which team handles this
  project: string[]             // Linked project ID
  projectRecordId?: string      // Same as project[0], easier to use
  projectItem?: string[]        // If it's per-item (not project-level)
  projectItemName?: string      // Human-readable item name
  requiresManagerReview: boolean[]  // Must manager approve completion?
  templateOrder?: number[]      // Controls unlock sequence
  // ... many more fields
}

// A project
interface Project {
  id: string                // Airtable record ID
  projectName: string
  projectId?: string        // Human-readable ID like "WW-2024-001"
  clientName?: string
  projectStage?: string     // e.g. "Preparing", "Open", "Installation Completed", "Closed"
  projectTotalCost?: number
  totalPaid?: number
  remainingBalance?: number
  // ...
}

// A payment record
interface Payment {
  id: string
  amount: number
  paymentType: string     // 'Advance', 'Final', 'Material', 'Delivery', 'Progressive'
  paymentStatus: string   // 'Received', 'Pending', 'Overdue'
  paymentMethod: string   // 'Cash', 'Bank Transfer', 'Cheque'
  receivedDate?: string
  payerType?: string      // 'Broker', 'End User', etc.
  // ...
}

// A daily installation log entry
interface InstallationLog {
  id: string
  projectId: string[]
  date: string
  workers: number
  notes?: string
}
```

---

### `lib/validation.ts` — Zod schemas

All API input schemas are here. Every PATCH/POST handler validates its body against these schemas before processing.

```typescript
// Key schemas:
AssignInstallationSchema   // { teamMemberIds, itemName?, itemId? }
F3OrderSchema              // material order items
HandoverSchema             // handover form fields
PaymentSchema              // payment recording
```

---

### `lib/notifications.ts` — In-app alerts

Manages the notifications shown in the sidebar bell icon.

```typescript
// Send a notification to a role or specific user
createNotification({
  recipientRole: 'manager',
  recipientUserId: 42,          // optional — specific user only
  title: 'New task ready',
  body: 'F3 order submitted for Project Alpha',
  link: '/dashboard/mgr',
})

// Get notifications for a user
getNotificationsForUser(role, userId, limit)

// How many unread?
getUnreadCountForUser(role, userId)

// Mark all as read
markAllReadForUser(role, userId)
```

Notifications auto-delete after 30 days to keep the database clean.

**Important:** Only `createNotification()` calls appear on the `/dashboard/notifications` page. Computed alerts (pending approvals, stale projects, call-client tasks) shown in the bell badge are live-fetched from Airtable and do NOT persist in the notifications table.

---

### `lib/apiHandler.ts` — API middleware

A helper that wraps API route handlers to automatically:
- Check if the user is logged in
- Check if the user has the right role
- Log the request
- Track metrics (response times, error rates)
- Record failed requests for replay

```typescript
// Usage in an API route:
export const GET = requireRole('manager', 'superadmin')(
  async (req, session, { params }) => {
    // session.role is guaranteed to be 'manager' or 'superadmin' here
    return NextResponse.json({ data: '...' })
  }
)

// No role restriction (any logged-in user):
export const GET = requireRole()(
  async (req, session) => { ... }
)
```

---

### `lib/fieldMap.ts` — Airtable IDs

A lookup table of every Airtable table ID and field ID. Never hardcode these in your code — always import from here.

```typescript
export const TASKS = {
  TABLE_ID: 'tblOGEvAGcieHMPeX',
  TASK_NAME: 'fldXXX',
  STATUS: 'fldXXX',
  // ...
}

export const PROJECTS = {
  TABLE_ID: 'tblXXX',
  PROJECT_NAME: 'fldXXX',
  // ...
}
```

---

## 8. The workflow engine

This is worth explaining in detail because it's the core of the app.

### The concept of task locking

When a project is created, tasks are automatically generated from templates. Most tasks start as `Locked` — invisible to users. They become available (`To Do`) only when their prerequisites are done.

```
Project created
      ↓
Phase 1 tasks generated (first = To Do, rest = Locked)
      ↓
SED completes "Make Quotation"
      ↓
workflow checks: what unlocks next?
      ↓
"F4 — Advance Payment" unlocks
      ↓
Manager completes "F4"
      ↓
"F5 — Quotation Details" unlocks for SED
      ↓
...and so on through Phases 2, 3, 4
```

### How `handleTaskCompletion()` works

This is called every time someone marks a task as Completed. It:

1. Decides the final status (sometimes `Completed`, sometimes `Pending Approval` if manager review is required)
2. Saves the completion to Airtable
3. Calls `unlockNextTasks()` to check what should open next
4. Calls `maybeGeneratePhase3()` — generates Phase 3 tasks for that item if this was the trigger task
5. Calls `maybeGeneratePhase4()` — generates Phase 4 tasks if this was the Handover Form task
6. Sends notifications (e.g., "F4 done — please submit F5")

### Manager review

Some tasks require manager approval before they count as completed. When a user marks them done, the status becomes `Pending Approval` instead of `Completed`. The manager then sees it in their pending approvals list and can approve or reject.

```
Installation marks task Completed
      ↓
requiresManagerReview = true
      ↓
Status → "Pending Approval" (not Completed yet)
      ↓
Manager sees it in pending approvals
      ↓
Manager approves → Status → "Completed" → workflow continues
Manager rejects  → Status → "To Do" again with a comment
```

---

## 9. The notification system

Notifications are stored in SQLite (not Airtable, for speed). They are role-based and/or user-specific.

**Role-based notification:** "Everyone who is a manager sees this alert"
**User-specific notification:** "Only user #42 (Sarah) sees this alert"

Every time something important happens in the workflow, a `createNotification()` call is made. Examples:
- Project created → notify the assigned SED
- F4 completed → notify SED to submit F5
- F5 submitted → notify manager, fabrication, installation
- Task pending approval → notify manager
- Installation team assigned → notify installation role (body includes project + item name)
- Final payment received → notify SED and superadmin that project is closed

The notification count badge in the sidebar calls `/api/notifications` on a timer to check for new ones.

**Notifications page:** `/dashboard/notifications` — shows the full notification history for the logged-in user's role. Accessible from the sidebar bell icon on all roles.

**Installation dashboard note cards:** The installation dashboard (`/dashboard/fix`) renders "assignment note" cards above the task list for any notification with `title === 'Installation team assigned'`, showing the project and item name the team was assigned to.

---

## 10. API routes cheat sheet

### Most-used endpoints

| Method | URL | What it does |
|--------|-----|-------------|
| GET | `/api/tasks` | Get tasks for the logged-in user's role |
| PATCH | `/api/tasks/[id]` | Update a task (status, fields, etc.) |
| POST | `/api/tasks/[id]/f3-order` | Submit an F3 material order |
| GET | `/api/projects` | Get projects (filtered by role) |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/[id]` | Get one project with its tasks and payments |
| PATCH | `/api/projects/[id]` | Update project (quotation number, notes, etc.) |
| GET | `/api/projects/[id]/quotation` | Get F5 quotation items |
| POST | `/api/projects/[id]/quotation` | Submit F5 quotation items |
| GET | `/api/projects/[id]/materials` | Get F3 material orders |
| POST | `/api/projects/[id]/handover` | Submit handover sheet |
| PATCH | `/api/projects/[id]/assign-installation` | Assign installation team to a project/item |
| GET | `/api/projects/[id]/items-progress` | Get per-item phase progress |
| GET | `/api/payments?projectId=` | Get payments for a project |
| POST | `/api/payments` | Record a payment (manager/superadmin only) |
| POST | `/api/installation-logs` | Log daily installation work |
| GET | `/api/notifications` | Get notifications for current user |
| POST | `/api/notifications/mark-read` | Mark notifications as read |
| GET/PATCH | `/api/settings` | Read/update app settings (superadmin only) |
| POST | `/api/projects/[id]/generate-tasks` | Seed tasks for a project phase (superadmin/dev only) |

### How a PATCH request works (task update)

When a user changes a task's status, the browser sends:
```json
PATCH /api/tasks/recXXXXXX
{
  "fields": {
    "status": "Completed"
  }
}
```

The handler in `app/api/tasks/[id]/route.ts`:
1. Checks the user is logged in
2. Validates the fields with Zod schema
3. Filters out any fields the role isn't allowed to edit (`filterAllowedFields`)
4. If status is "Completed", calls `handleTaskCompletion()` (workflow engine)
5. Otherwise calls `updateTask()` directly
6. Returns the updated task

---

## 11. How forms and panels work

Inside a task card, there are special panels for tasks that need more than a simple status change. These are React components in `components/tasks/panels/`.

| Panel | Used for | What it does |
|-------|----------|-------------|
| `QuotationPanel` (f4 variant) | F4 tasks | Records advance payment details, POSTs to `/api/payments` |
| `F5QuotationPanel` | F5 tasks | Collects quotation line items, POSTs to `/api/projects/[id]/quotation` |
| `F3OrderPanel` | F3 tasks | Collects material order items, POSTs to `/api/tasks/[id]/f3-order` |
| `FixingTeamNotePanel` | Installation day tasks | Logs daily work (date + workers + notes), POSTs to `/api/installation-logs`; Arabic UI, violet theme |
| `AttachDocsPanel` | Document tasks | Uploads files to the task |
| `ChooseInstallTeamPanel` | Installation assignment tasks | Picks installation team, PATCHes `/api/projects/[id]/assign-installation` with itemName + itemId |
| `F2ProductionPanel` | F2 tasks | Sets production start/end dates, creates calendar event |

Each panel receives:
- `task` — the task data (to show existing info)
- `onUpdate` — a function to call when the task should be updated

When a panel "completes" a task, it:
1. Saves its specific data (e.g., payment to Airtable Payments table)
2. Then calls `onUpdate(task.id, { status: 'Completed' })` which triggers the full workflow

**How `ChooseInstallTeamPanel` works (detail):**
It sends `itemName` and `itemId` (from `task.projectItemName` and `task.projectItem[0]`) in the PATCH body. The assign-installation API route passes these to `assignInstallationTeam()` in airtable.ts, which includes them in the notification body so the installation team sees the project AND item name in their dashboard note card.

---

## 12. Phase generation

The project lifecycle has four phases, each auto-starting when the previous phase reaches a trigger point.

### Phase overview

| Phase | Label | Trigger | Scope |
|-------|-------|---------|-------|
| Phase 1 — Preparing | — | Project created (seeded manually or via superadmin) | Project-level |
| Phase 2 — Opening | `Phase 2 — Opening` | Part of initial generation; per-item tasks at order ≥ 23 | Per item |
| Phase 3 — Working | `Phase 3 — Working` | Template order 29 completes (per item) | Per item |
| Phase 4 — Closing | `Phase 4 — Closing` | Task name starts with `'handing over form'` | Project-level |

### Phase 3 generation in detail

`maybeGeneratePhase3(task)` fires inside `handleTaskCompletion` whenever `task.templateOrder[0] === 29`. It calls `generatePhase3TasksForItem(projectId, itemId)`.

`generatePhase3TasksForItem` does three things:
1. **Fetches all templates** (no stage filter) and filters by `phaseLabel === 'Phase 3 — Working'`
2. **Idempotency check**: queries existing tasks linked to this item, skips templates already created
3. **Sequential unlock**: the lowest-order new template starts as `To Do`; all others start as `Locked`. The existing `unlockNextTasks` engine handles subsequent unlocking as each task completes.

**Why no stage filter?** Phase 3 templates in Airtable have `projectStage = "Production"`. Calling `getTaskTemplates('Open')` (or any other stage) would miss them. We fetch all templates and filter by `phaseLabel` instead.

### Phase 4 generation in detail

`maybeGeneratePhase4(task)` fires when `task.taskName.toLowerCase().startsWith('handing over form')`. It calls `generatePhase4Tasks(projectId)`.

`generatePhase4Tasks` fetches templates with `stage = 'Closed'` and `phaseLabel === 'Phase 4 — Closing'`, then creates them with sequential status (min order = `To Do`, rest = `Locked`).

### Seeding tasks manually (superadmin/dev)

`POST /api/projects/[id]/generate-tasks` with body `{ stage: 'phase1' | 'phase2' | 'phase3' | 'phase4', force?: boolean }` can be used to seed tasks for an existing project. The `phase3` handler iterates all project items and calls `generatePhase3TasksForItem` for each (idempotency prevents duplicates).

---

## Quick reference: tracing a bug

**"A task isn't completing"**
→ Check `app/api/tasks/[id]/route.ts` PATCH handler
→ Check `handleTaskCompletion()` in `lib/workflow.ts`
→ Check `filterAllowedFields()` — maybe the role can't set that field

**"Phase 3 tasks didn't appear after manager assigned installation team"**
→ Check `maybeGeneratePhase3` in `lib/workflow.ts` — does `task.templateOrder[0] === 29`?
→ Check `generatePhase3TasksForItem` in `lib/airtable.ts` — idempotency check may have found existing tasks
→ Check that templates in Airtable have `phaseLabel = 'Phase 3 — Working'` set correctly

**"A project isn't showing for a SED user"**
→ Check `getProjects()` in `lib/airtable.ts` — does it filter by SED?
→ Check `getSedProjectIdsByUserId()` in `lib/db.ts` — is the mapping saved?
→ Check `app/api/projects/route.ts` GET handler

**"A notification isn't appearing"**
→ Check if `createNotification()` is called in the right workflow step
→ Check `lib/notifications.ts`
→ Check the `recipientRole` — is it the right role?

**"A payment isn't showing in the forms section"**
→ Check `getPaymentsByProject()` in `lib/airtable.ts`
→ Check `app/api/payments/route.ts` GET handler
→ Check `ProjectFormsSection.tsx` — is `showPayments` true for this role?

**"A form panel isn't saving"**
→ Check the panel component in `components/tasks/panels/`
→ Check the API endpoint it POSTs to
→ Check `requireRole()` — does this role have permission?

**"Installation team assignment note not showing on fix dashboard"**
→ Check `createNotification()` call in `assignInstallationTeam` in `lib/airtable.ts`
→ Check that `recipientRole: 'installation'` is set
→ Check `app/dashboard/fix/page.tsx` — filters for `title === 'Installation team assigned'`

---

*This document reflects the live codebase as of 2026-06-02. If something changed and this guide is outdated, the authoritative source is always the code itself.*
