# Testing

Four layers, each answering a different question. Run the cheap ones constantly; the expensive
ones catch what the cheap ones structurally cannot.

| Layer | Command | Answers | Network |
|---|---|---|---|
| **Unit** | `npm test` | "Is the logic right?" | none — dummy credentials |
| **Contract** | `npm run test:contract` | "Does Airtable still look the way we assume?" | reads schema only |
| **Integration** | `RUN_INTEGRATION=1 npm run test:integration` | "Does the read/write round-trip work?" | **writes** (self-cleaning) |
| **E2E** | `npm run e2e` | "Can a user complete the journey?" | full app |

Also available: `npm run test:watch`, `npm run test:coverage`, `npm run e2e:ui`, `npm run e2e:debug`.

---

## Unit — `npm test`

Pure logic only (`lib/orderChain.ts`, `lib/permissions.ts`, `lib/validation.ts`, `lib/dateUtils.ts`).
Runs offline in a few seconds: `vitest.config.ts` injects dummy Airtable credentials so modules
that call `validateEnv()` at import time can load, and it **excludes** `tests/contract/**` and
`tests/integration/**` so the unit run never touches the network.

**Add a test here when the thing under test is a decision you can express as inputs → output.**
If logic is tangled with an Airtable call, extract the decision into a pure function first —
`lib/orderChain.ts` is the model to copy.

## Contract — `npm run test:contract`

Pins the assumptions the code makes about the Airtable base ([tests/contract/schema.test.ts](tests/contract/schema.test.ts)):

1. every table referenced by `lib/fieldMap.ts` still exists
2. every field id in `fieldMap` still exists on its table
3. `Project Stage` offers every `STAGE_ORDER` value (+ `Not-Approved`)
4. `Maintenance` `Status` / `Warranty Type` offer the values the code writes
5. fields the code **writes** are still writable — not turned into a formula/lookup

Unit tests can't see any of this (they run on dummy credentials), so schema drift used to surface
only as a 422 in production. Real regressions this catches: Maintenance `End Date` becoming a
computed field, `Warranty Type` losing `Standard 1-Year`, `Project Stage` missing `Closing`.

**Read-only** — it reads base metadata and never touches records. Safe against any base.

When you add a field to `fieldMap`, or start writing a new single-select value, add the assertion here.

## Integration — `RUN_INTEGRATION=1 npm run test:integration`

Exercises the real read/write round-trip ([tests/integration/airtable.test.ts](tests/integration/airtable.test.ts)):
linked-record fields come back as record-id strings (not objects), project items resolve through
the linked-project filter, and installation logs are scoped **per item** so one item's day never
appears under another. Every assertion maps to a bug that reached production.

### Safety rules — read before running

This suite **creates and deletes real records**. It is fenced in five ways:

- **Opt-in only** — without `RUN_INTEGRATION=1` the whole suite skips and writes nothing.
- **Refuses fake credentials** — dummy/`test` keys are rejected, so it can't run in the unit job.
- **Self-seeding** — it creates its own project, items and logs; no pre-existing fixtures needed.
- **Self-cleaning** — everything is deleted in `afterAll`; records are prefixed
  `ZZ-INTEGRATION-TEST` so any orphan is obvious. To check for leftovers, search that string in
  Projects / Project Items / Installation Logs.
- **Separate credentials** — in CI it reads `INTEGRATION_AIRTABLE_*`, never the contract secrets.

> ⚠️ **Point `INTEGRATION_AIRTABLE_BASE_ID` at the preview base — never production.**
> This is the only part of the test setup that can modify real data.

## E2E — `npm run e2e`

Playwright specs in `e2e/` (login, manager, sed, superadmin). E2E is the most expensive layer to
maintain, so keep it to the few critical journeys and let the layers above cover everything else.

---

## CI — [.github/workflows/ci.yml](.github/workflows/ci.yml)

| Job | When | Needs secrets? |
|---|---|---|
| `verify` — `tsc --noEmit`, unit tests, production build | every push + PR | no (dummy env) |
| `schema-contract` | every push + PR | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` |
| `integration` | `staging` branch + manual dispatch only | `INTEGRATION_AIRTABLE_API_KEY`, `INTEGRATION_AIRTABLE_BASE_ID` |

Both real-base jobs **skip themselves** when their secrets are absent, so a missing secret never
fails the build. `integration` never runs on `main`.

### Required GitHub secrets
Settings → Secrets and variables → Actions:

| Secret | Point it at | Why |
|---|---|---|
| `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` | the **production** base | read-only — guards the schema real users hit |
| `INTEGRATION_AIRTABLE_API_KEY` / `INTEGRATION_AIRTABLE_BASE_ID` | the **preview** base ⚠️ | this one gets written to |

#### Setting them up

1. **Create an Airtable token** at [airtable.com/create/tokens](https://airtable.com/create/tokens).
   - Scopes: `schema.bases:read` (contract), plus `data.records:read` and `data.records:write`
     (integration).
   - Under *Access*, explicitly add the base(s). Airtable PATs are per-base — a token without the
     base added returns 403.
   - One token can serve both pairs, or use a read-only one for the contract secrets.
2. **Find the base ids.** Production is in your `.env.local` (`AIRTABLE_BASE_ID`). The preview base
   id is in Vercel → *Settings → Environment Variables* → filter **Preview** → `AIRTABLE_BASE_ID`.
3. **Add the four secrets** at *Settings → Secrets and variables → Actions → New repository secret*.
4. **Confirm.** Push to `staging` and open the Actions tab — `schema-contract` and `integration`
   should now run instead of skip.

---

## Where does my new test go?

- Pure decision, no I/O → **unit**
- "Does Airtable still have this field / choice / writable type?" → **contract**
- "Does creating X and reading it back actually work?" → **integration**
- "Can a user get through this flow?" → **E2E**

Rule of thumb: **if a bug can be written as an assertion, it belongs in a test, not a manual click.**

## Running locally

Contract and integration read `.env.local` automatically (see `tests/contract/setup.ts`), so no
extra flags are needed — but remember `.env.local` decides *which base* they hit. Check it before
running the integration suite.

---

# Before deploying to production

Promotion is `staging → main`. The manual checklist is **derived per release, not fixed** — it
shrinks as more checks become tests.

### 1. Confirm the branches are clean
```bash
git fetch origin
git rev-list --left-right --count origin/main...origin/staging
```
The **left** number (commits on main that staging lacks) should be `0` — that means a clean
fast-forward with no conflicts. Also check CI is green on `staging`.

### 2. See what's shipping
```bash
git log --oneline origin/main..origin/staging
```

### 3. Derive the manual checklist
Only app-facing files need a human look. Filter out everything that can't change runtime behaviour:
```bash
git diff --name-only origin/main origin/staging \
  | grep -vE '^(tests/|coverage/|docs?/|public/manuals/|scripts/|.*\.md$|vitest|package|\.github/)'
```
Whatever survives is your checklist. Test-only, docs-only and CI-only commits need **no** manual
testing at all — that's the point of the layers above.

Then walk the surviving files back to the user-visible behaviour they control and click exactly
those paths. A worked example, for a release whose filter returned five files:

| File(s) | What to check by hand |
|---|---|
| `app/api/team/sed/route.ts`, `components/projects/NewProjectModal.tsx` | New Project form: SED picker shows projects and requests separately; a Commun-only SED shows a non-zero count; numbers match the SED chart |
| `app/api/tasks/[id]/assign-measurement/route.ts` | "Assign & Notify" leaves the SED chip **In Progress** (not Completed); installation receives the spawned task |
| `components/tasks/TaskList.tsx`, `lib/airtable/tasks.ts` (`supersedeGatewayMeasurementTasks`) | After assigning measurement, the pathed project-level "Take Measurement" task is Completed and never reappears as a SED gateway chip; the SED's "Ask installation team to Take Measurement" chip is untouched |
| `app/api/cron/inactivity-check/route.ts`, `lib/airtable/tasks.ts` (`getLastModifiedTaskForProject`) | Actions → *Inactivity Check* → Run workflow; the alert **names the stalled task** ("Last task: …") and fires across all active stages |

> Note how two features here span both a route/component **and** `lib/`. Walk every surviving file
> back to the behaviour it supports — several files often collapse into one thing to click.

### 4. Promote and deploy
```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff staging -m "Merge staging → main: <summary>"
git push origin main
npm run deploy            # vercel --prod --yes
git checkout staging
```

### 5. Close the loop
Anything you just checked by hand that could have been an assertion should become one, so it drops
off this list for good. Pure decisions (count predicates, chip-visibility rules) → **unit**;
read/write round-trips → **integration**.
