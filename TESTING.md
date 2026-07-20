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

| Secret | Point it at |
|---|---|
| `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` | the base whose schema should be guarded (read-only) |
| `INTEGRATION_AIRTABLE_API_KEY` / `INTEGRATION_AIRTABLE_BASE_ID` | **the preview base** (it gets written to) |

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
