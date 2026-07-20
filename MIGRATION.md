# Migration Plan — Personal → Company Accounts

Transfer ownership of every service from the developer's personal accounts to company-email accounts, so operation and billing no longer depend on any individual. Do the steps **in order**; each has a verification gate.

## Services & what they hold

| Service | Holds | Current account owner |
|---|---|---|
| **GitHub** | Repo `aisolutions963-org/code`, Actions cron workflows, secrets `CRON_SECRET` + `APP_URL` | personal |
| **Vercel** | Project `woodwings` (production + preview envs, domains, env vars) | personal |
| **Turso** | Two DBs: production + staging (auth users, notifications, settings, inactivity-alerts) | personal |
| **Airtable** | **Two bases**: production `app3dfYnArFbZ6dpy` + preview `app2dcaTitMNZthHh` (all business data) | personal |
| **Resend** | Sender domain `woodwings.ae` (`notifications@woodwings.ae`) | personal |

> ⚠️ **Turso DB name warning:** the DB named `woodwings` (no suffix) is **production** (actively used); `woodwings-prod` is actually **staging**. Go by activity, not name.

## Pre-migration checklist

- [ ] Company accounts created on all 5 services (company email)
- [ ] You hold admin on both old + new accounts during the transition
- [ ] **Copy every Vercel env var value manually** (Settings → Environment Variables — not exportable): `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (× Production AND Preview — different values!), `SESSION_SECRET`, `RESEND_API_KEY`, `MANAGER_EMAIL`, `ACCOUNTANT_EMAIL`, `NEXT_PUBLIC_APP_NAME`, `CRON_SECRET`, `TURSO_URL` + `TURSO_AUTH_TOKEN` (× Production AND Preview — different values!)
- [ ] Turso backups: `turso db shell <db> .dump > backup.sql` for BOTH DBs
- [ ] Accountant email already points at `accountant@woodwings.ae` (code default done; confirm Turso `settings.accountant_email` in BOTH DBs)

## Step 1 — GitHub repository
1. Repo → Settings → Danger Zone → **Transfer ownership** → company org.
2. Re-create Actions secrets in the new repo: `CRON_SECRET` (rotate recommended), `APP_URL` = the production URL.
3. Verify the three workflows are **enabled** after transfer (Actions tab): Inactivity Check (daily 08:00 UAE), cron-reminders (weekly/monthly). GitHub disables schedules on transferred/inactive repos — re-enable if needed.
4. Dev machines: `git remote set-url origin https://github.com/COMPANY_ORG/code.git`.

**Verify:** manually dispatch "Inactivity Check" (workflow_dispatch) → run green (HTTP 200).

## Step 2 — Turso (both DBs)
Preferred: create a company Turso org → transfer both DBs → mint new tokens (`turso db tokens create <db>`).
Fallback: dump & restore each DB into the company org (commands in Turso docs; backups from the checklist).
Keep the new `TURSO_URL`/`TURSO_AUTH_TOKEN` pairs ready for Step 3 — production and staging values are **different**.

**Verify:** `turso db list` under the company org shows both; a `SELECT count(*) FROM users` matches the backup.

## Step 3 — Vercel project
1. Invite the company Vercel account/team as Owner → Settings → **Transfer Project**.
2. Re-enter ALL env vars with the correct per-environment scoping (see checklist; Preview and Production differ for `AIRTABLE_BASE_ID` and `TURSO_*`). Use the new Turso values from Step 2.
3. Reconnect the GitHub integration to the transferred repo (optional — deploys are done via CLI: `vercel deploy --yes` for preview, `vercel deploy --prod --yes` for production; the team members who deploy must link the new project with `vercel link`).
4. Domains: confirm the production domain moved with the project.

**Verify:** `vercel deploy --prod --yes` from `main` builds and serves; login works.

## Step 4 — Airtable (BOTH bases)
1. For **each base** (production + preview): Share → invite company email as **Owner** (or transfer the whole workspace containing them — simpler if both live in one workspace).
2. Company account creates a new personal access token with scopes **`data.records:read`, `data.records:write`, `schema.bases:read`** granted on **both bases** (schema read is used by field-type tooling; keep parity with the old key).
3. Update `AIRTABLE_API_KEY` in Vercel (both environments) and in local `.env.local`.
4. Base IDs don't change on transfer — `fieldMap.ts` and `AIRTABLE_BASE_ID` values stay as they are.
5. Demote/remove the personal account.

**Verify:** preview + production apps both load projects/tasks; `npx tsx scripts/sync-fieldmap.ts` passes against each base.

## Step 5 — Resend
1. Company Resend account → add domain `woodwings.ae` → update the DNS TXT/DKIM records to the new values.
2. New API key → update `RESEND_API_KEY` in Vercel (both envs).
3. Remove the domain from the old account.

**Verify:** record a test payment on preview → accountant email arrives from `notifications@woodwings.ae`.

## Step 6 — Cutover order & final verification
1. Do steps 1→5 with the app still running on old credentials; each step swaps one credential at a time (the app tolerates this — email/crons degrade gracefully, Airtable/Turso swaps take effect on next deploy).
2. After all swaps: deploy preview → run the role smoke (login as each of the 5 roles, tasks load, calendar loads, add a receivable, record a payment) → merge/deploy production → repeat the smoke there.
3. `curl -H "Authorization: Bearer <new CRON_SECRET>" <prod-url>/api/cron/inactivity-check` → 200.
4. Remove personal-account access everywhere (GitHub collaborators, Vercel members, Airtable collaborators on both bases, Turso org members, old Resend account).

## Post-migration checklist
- [ ] All 5 roles log in on production; data loads
- [ ] GitHub Actions runs green on schedule under the company org
- [ ] Accountant + manager emails arrive at company addresses
- [ ] Both Airtable bases owned by company; old token revoked
- [ ] Both Turso DBs under company org; old tokens revoked
- [ ] Personal accounts hold zero access on every service
