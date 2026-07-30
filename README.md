# WoodWings — Project Management System

Start here if you're picking this project back up after a while and need to get your bearings
fast. Nothing here assumes you remember the details — that's the point.

## What this is

A web app that tracks a WoodWings furniture/fit-out project from the first client call all the way
through design, production, installation, and a year of warranty afterward. Every project moves
through a defined sequence of stages and tasks; the app is basically a shared checklist + payment
tracker + calendar for everyone involved, with different views depending on your role.

## Who uses it

- **Superadmin** — you. Full access to everything, plus admin-only tools (user management,
  announcements, worker roster).
- **Manager** — day-to-day oversight: projects, payments, installation team assignment, timesheets.
- **SED** (Sales & Design) — owns a project from first contact through design/quotation.
- **Fabrication** — factory-side production tasks.
- **Installation** — on-site installation tasks and logs.

Full detail on what each role can actually do: [USER_GUIDE.md](USER_GUIDE.md).

## Tech stack, in one line each

- **Next.js / React / TypeScript** — the app itself (App Router, `app/` directory).
- **Airtable** — the main database (projects, tasks, payments, everything business-related), hit
  directly over its REST API (no SDK) via `lib/airtable/*.ts`.
- **Turso / libSQL** — a small separate database, just for login accounts and in-app notifications.
- **Vercel** — hosting, for both the live app and preview deployments.

## Where things live

- `app/` — every page and API route (Next.js App Router — folder structure = URL structure).
- `lib/airtable/` — all the Airtable reads/writes, split by domain (projects, tasks, payments,
  calendar, etc.), re-exported through `lib/airtable/index.ts`.
- `lib/fieldMap.ts` — every Airtable table/field ID the code depends on, as hardcoded constants.
- `components/` — shared UI, organized by feature area.
- The 6 docs in this folder (this file plus the 5 below) — everything else you'd need to know.

## The URLs you'll always need

| What | Where |
|---|---|
| **Production app** | https://pms.woodwings.ae |
| **Vercel project** (deploys, env vars, logs) | https://vercel.com/aisolutions963-9697s-projects/woodwings |
| **GitHub repo** | https://github.com/aisolutions963-org/code |
| **Airtable — production base** | `app3dfYnArFbZ6dpy` — real client/project data |
| **Airtable — preview base** | `app2dcaTitMNZthHh` — safe to test against, used by preview deploys |

Don't mix these two Airtable bases up — which one the app talks to is controlled entirely by the
`AIRTABLE_BASE_ID` environment variable (different value per Vercel environment). Production data
is real client data; the preview base is the sandbox.

## The release workflow

This is the loop every change goes through, from the smallest tweak to a big feature. Do it in this
order, every time:

1. Work on the `staging` branch, locally (`npm run dev` to run it).
2. Commit, push to `origin/staging`.
3. Deploy the preview: `npm run deploy:preview` (or `vercel --yes`).
4. Click through the change on the preview URL and confirm it actually works — the preview points
   at the *preview* Airtable base, so nothing here touches real data.
5. Only once you're happy: merge `staging` → `main`, push, then `npm run deploy` (this is
   `vercel --prod --yes` — it deploys straight to `pms.woodwings.ae`, no extra confirmation step,
   so don't run it until step 4 is actually done).

Before that last step, it's worth a quick look at the checklist in
[TESTING.md](TESTING.md#before-deploying-to-production) — it tells you exactly which files in your
change actually need a manual click-through versus which are already covered by tests.

## One known issue (not something you broke)

GitHub Actions runs a CI check called `integration` on every push to `staging`. It's been failing
since the day it was added — this is a pre-existing gap, not a regression, and it doesn't block
deploys (the checks that actually gate correctness — typecheck, unit tests, build, schema contract
— all pass). It almost certainly just needs the `INTEGRATION_AIRTABLE_API_KEY` /
`INTEGRATION_AIRTABLE_BASE_ID` secrets added in the GitHub repo settings. See
[TESTING.md](TESTING.md) for the setup walkthrough if you want to fix it.

## The other docs, and when to open them

- **[USER_GUIDE.md](USER_GUIDE.md)** — what each role sees and can do. Read this if you forgot how
  a feature is supposed to work from the user's side.
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** — setting up your machine, environment variables,
  coding conventions, and a list of things that are deliberately built the way they are (don't
  "fix" them without reading why first).
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the data model, API routes, and business logic in
  detail. Read this before making a non-trivial change so you're not guessing at how something
  already works.
- **[TESTING.md](TESTING.md)** — the four layers of tests, what CI actually checks, and the
  pre-production checklist referenced above.
- **[CREDENTIALS.md](CREDENTIALS.md)** — login accounts and where each credential/API key lives
  and how to rotate it. Not committed to git (check your local copy).
- **[MIGRATION.md](MIGRATION.md)** — the one-time runbook used to move every account (GitHub,
  Vercel, Airtable, Turso, Resend) to the company's ownership. Only relevant if that ever needs to
  happen again.
