# WoodWings — Developer Guide

How to set up, run, test, and ship this codebase. For *what the system does and how the pieces fit*, read **ARCHITECTURE.md** first. For what each role experiences in the app, see **USER_GUIDE.md**.

---

## 1. Setup

```bash
git clone https://github.com/aisolutions963-org/code.git
cd code
npm install
cp .env.local.example .env.local   # then fill in values (see below)
npm run dev                        # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Required | Notes |
|---|---|---|
| `AIRTABLE_API_KEY` | ✅ | Personal access token. Scopes: `data.records:read/write` + `schema.bases:read` on both bases. |
| `AIRTABLE_BASE_ID` | ✅ | **Which base the app talks to.** Production `app3dfYnArFbZ6dpy`, Preview/staging `app2dcaTitMNZthHh`. |
| `SESSION_SECRET` | ✅ | JWT signing secret, min 32 chars. |
| `TURSO_URL` / `TURSO_AUTH_TOKEN` | prod/preview | Omit locally → falls back to `file:data/users.db`. |
| `RESEND_API_KEY` | optional | Emails silently skip when unset. |
| `MANAGER_EMAIL` / `ACCOUNTANT_EMAIL` | optional | Email recipients (accountant falls back to Turso `settings.accountant_email`). |
| `CRON_SECRET` | cron only | Bearer token the cron routes require. |

### The two-base model (important)

There are **two full copies of the Airtable base** with identical table/field IDs (`lib/fieldMap.ts` works for both):

| Environment | Base | Turso DB |
|---|---|---|
| Production (main branch, prod deploy) | `app3dfYnArFbZ6dpy` | production Turso |
| Preview (staging branch, preview deploys) | `app2dcaTitMNZthHh` | staging Turso |

Vercel injects the right `AIRTABLE_BASE_ID`/`TURSO_*` per environment. **Check which base your `.env.local` points at before running scripts** — most scripts read `.env.local` and will happily write to production.

---

## 2. Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npx tsc --noEmit` | Typecheck (0 errors is the bar) |
| `npm test` / `npx vitest run` | Unit tests (`tests/`) — all must pass before any deploy |
| `npm run test:coverage` | Coverage (output in `coverage/`, gitignored) |
| `npm run e2e` | Playwright end-to-end tests (`e2e/`) |
| `npm run build` | Production build — final gate before deploying |
| `vercel deploy --yes` | **Preview** deploy (run on `staging`) |
| `vercel deploy --prod --yes` | **Production** deploy (run only after merging to `main`) |
| `npx tsx scripts/<name>.ts` | Run an ops script (reads `.env.local`) |

## 3. Branch & release flow

```
staging  ──work here──►  preview deploy (vercel deploy --yes)  ──user verifies──►
merge:   git checkout main && git merge --ff-only origin/staging && git push origin main
deploy:  vercel deploy --prod --yes
```

- All changes land on `staging` first and get verified on a preview URL against the preview base.
- `main` should always be a fast-forward of `staging` (never diverge them).
- Git-integration auto-deploys are NOT active — every deploy is an explicit CLI command.
- Gate before any deploy: `tsc` 0 errors + all unit tests green + `npm run build` clean.

## 4. Ops scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `seed-admin.ts` / `seed-users.ts` (`npm run db:reset`) | Seed login users into Turso |
| `activate-user.ts` | Activate a user account |
| `backup-db.ts` | Turso backup |
| `clean-db.ts` / `wipe-data.ts` | ⚠️ Destructive resets — check `AIRTABLE_BASE_ID` first |
| `sync-fieldmap.ts` | Verify `lib/fieldMap.ts` IDs against the live base |
| `repair-stuck-unlocks.ts` | Re-run the unlock chain for stuck projects |

Script pattern: `loadEnv({ path: '.env.local', override: true })` — and note `BASE_ID` is captured **at import time** in `lib/airtable/_client.ts`, so set `process.env.AIRTABLE_BASE_ID` *before* dynamically importing `@/lib/airtable` if you need to retarget.

---

## 5. Conventions

- **Airtable IDs** live only in `lib/fieldMap.ts`. Never hard-code a `tbl…`/`fld…` anywhere else; verify in Airtable before changing one (wrong IDs fail silently).
- **URL builders**: table-level ops (list/create) use `tblUrl(TABLE_ID)`; record-level ops (PATCH/DELETE) use `recUrl(TABLE_ID, recordId)`. Mixing them corrupts the URL.
- **Field extractors** (`str`, `strArr`, `lookupStrArr`, `selectName`, …) — always use them; linked-record fields return `string[]`, and `str()` on an array returns `undefined` (the #1 bug source).
- **Writing linked fields** always takes array form: `{ [TASKS.PROJECT]: [projectId] }`.
- **Zod-validate every request body** via schemas in `lib/validation.ts`; wrap handlers in `requireRole(...)`.
- **Select options in forms must match Airtable choices exactly** — Airtable rejects unknown singleSelect values (no typecast on most writes). When adding a form, check the field's choices first (metadata API or Airtable UI).
- **Display ids**: use `projectRefLabel()` (`lib/projectRef.ts`) — quotation number+reference, WW-xx fallback. Never key logic on the display id; use record ids.
- **Notifications are fire-and-forget** — never let a notification failure block the main operation, and never `await` them in a user-facing critical path unless part of a `Promise.all` side-effect batch.
- **SWR**: after any mutation call the relevant `mutate()`s — the project page has two (`items-progress` and `tasks?projectId`).
- **Stage names are exact strings** — see `STAGE_ORDER` in `lib/phases.ts` + `lib/stageDisplay.ts` for labels. Never invent stage values ("Fabrication"/"Installation" are departments, not stages).

## 6. Do-not-touch (stability contract)

These are complete, tested, and load-bearing. Don't refactor without a confirmed bug:

1. **`lib/fieldMap.ts`** — the ID registry.
2. **`PHASE_CONFIG` numbers** (`lib/phases.ts`) — generation thresholds (`triggerOrder: 29`, `perItemOrderMin: 23/30`, …). Everything keys off them.
3. **`lib/orderChain.ts` semantics** — `isTaskDone`/`planUnlock` rules encode hard-won regressions (fab branches, measurement side-tasks, abandoned gateway paths, trigger self-exclusion). Change only with a failing test first — `tests/orderChain.test.ts` documents each rule.
4. **Task generation functions** (`generateTasksForProject`, `generateItemTasksForProject`, `generatePhase3TasksForItem`, `generatePhase4Tasks`) — all idempotent (dedup by template link); Phase 4 also self-normalises the closing chain head.
5. **Auth** (`lib/auth.ts`/`lib/db.ts`) — JWT + bcrypt; new roles require updating `ROLE_TO_DEPARTMENT`, validation enum, and dashboards.
6. **`pathCondition` string values** — must exactly match Airtable select names (Phase 1: "Make Quotation", "Visit Site to Gather Details", "Select Material / Order Samples", "Assign Installation for Measurement", "Draft Proposal or Photo Ideas", "Client Clarifications & Sketches"; Phase 2: "Site Visit (item)", "Select Sample (item)", "Design (item)", "Measurement (item)").
7. **Items-progress pipeline** — F5 submit → `createProjectItem` → `createQuotation` → `generateItemTasksForProject` (must be **awaited** — fire-and-forget dies on serverless) → complete task → mutate.
8. **Warranty flow order** — Phase 4 creates the maintenance record (`Pending`, 1-year clock); Final payment activates it and moves the stage; expiry cron closes it. Don't reorder.
9. **Payment guards** — one non-cancelled Final payment per project (409), duplicate type+amount+date guard (409); surface the response error in UI.
10. **`triggerPrint()`** (`lib/printGatePass.ts`) — overlay-based printing; popups/blob URLs/iframes were all blocked before.
11. **Client autocomplete** in NewProjectModal is lazy-loaded on purpose (Airtable quota).

## 7. Testing map

| Suite | Covers |
|---|---|
| `tests/orderChain.test.ts` | Every unlock-chain rule + regression (the most important suite) |
| `tests/phases.test.ts` | `isAutoTask` recognition incl. order-64 closing transition |
| `tests/validation.test.ts` | Zod schemas |
| other `tests/*` | fieldMap shape, workflow helpers |
| `e2e/` | Playwright login + role flows (needs `E2E_PASSWORD`) |

When you fix a workflow bug, add the regression case to `tests/orderChain.test.ts` in the same commit — that file is the living spec of the engine.
