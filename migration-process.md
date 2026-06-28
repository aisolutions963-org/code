# Migration Process — Personal → Company Accounts

## Context

The project currently runs under personal accounts (GitHub, Vercel, Turso, Airtable, Resend). Transfer ownership of every service to the company's email-based accounts so the original developer is no longer accountable for its operation.

---

## Services to Migrate

| Service | What it holds | Transfer method |
|---|---|---|
| **GitHub** | Source code, Actions workflows, secrets | Repository transfer |
| **Vercel** | Hosting, env vars, deployments, cron | Project transfer |
| **Turso** | Production + staging SQLite DBs | Org transfer or dump→restore |

> ⚠️ **DB name warning:** The Turso DBs are named counter-intuitively. `woodwings` (no suffix) is **production** (145k rows read, actively used). `woodwings-prod` is actually **staging** (empty, newly created). Don't go by the name — go by activity.
| **Airtable** | All business data (projects, tasks, payments…) | Base ownership transfer |
| **Resend** | Email via `notifications@woodwings.ae` | Account transfer + domain re-verify |

---

## Pre-Migration Checklist

- [ ] Company has created accounts on all 5 services using the company email
- [ ] You have collaborator/admin access on both old and new accounts during transition
- [ ] **Copy all Vercel env vars manually** — they are not exported automatically (listed in Step 4)
- [ ] Take a Turso production DB backup: `turso db shell <db> .dump > prod_backup.sql`

---

## Step 1 — Fix hardcoded email in code ✅

**Already done.** `lib/db.ts` default accountant email changed from `aisolutions963@gmail.com` → `accountant@woodwings.ae`.

Also update the live value in the production and staging Turso DBs (run once via Turso shell):
```sql
UPDATE settings SET value = 'accountant@woodwings.ae' WHERE key = 'accountant_email';
```

---

## Step 2 — Transfer GitHub repository

1. **GitHub → repo → Settings → Danger Zone → Transfer ownership** → transfer to company org/account
2. After transfer, re-add GitHub Actions secrets in the new repo:
   - `CRON_SECRET` (same value or rotate it)
   - `APP_URL` = `https://woodwings.ae`
3. Update local remote on any dev machines: `git remote set-url origin https://github.com/COMPANY_ORG/code.git`
4. Note: the Vercel–GitHub integration will break — reconnect it in Step 4

---

## Step 3 — Transfer Turso databases

Do this for **both** the production DB and the staging DB.

**Option A — Turso org transfer (preferred):**
1. Create a Turso organization under the company email
2. Dashboard → transfer each DB to the new org
3. Generate new auth tokens: `turso db tokens create <db-name>`
4. Note the new `TURSO_URL` for each DB

**Option B — Dump and restore (if org transfer is unavailable):**
```bash
turso db shell <prod-db> .dump > prod_backup.sql
turso db create woodwings-prod --org COMPANY_ORG
cat prod_backup.sql | turso db shell woodwings-prod
turso db show woodwings-prod --url      # note new URL
turso db tokens create woodwings-prod   # note new token
# repeat for staging DB
```

Have the new `TURSO_URL` and `TURSO_AUTH_TOKEN` values ready for Step 4.

---

## Step 4 — Transfer Vercel project

**Before transferring**, copy these env var values from the Vercel dashboard (Settings → Environment Variables). Vercel does not export them automatically.

| Variable | Scope |
|---|---|
| `AIRTABLE_API_KEY` | Production + Preview |
| `AIRTABLE_BASE_ID` | Production + Preview |
| `SESSION_SECRET` | Production + Preview |
| `RESEND_API_KEY` | Production + Preview |
| `MANAGER_EMAIL` | Production + Preview |
| `ACCOUNTANT_EMAIL` | Production + Preview |
| `CRON_SECRET` | Production + Preview |
| `TURSO_URL` | Production value + separate Preview (staging) value |
| `TURSO_AUTH_TOKEN` | Production value + separate Preview (staging) value |

**Transfer steps:**
1. Invite company Vercel account to the project as Owner
2. **Vercel → woodwings → Settings → Transfer Project** → transfer to company team
3. In the new account: re-enter all env vars (paste saved values; use new Turso values from Step 3)
4. Reconnect the GitHub integration to the new repository
5. Trigger a manual redeploy to confirm it builds and runs

---

## Step 5 — Transfer Airtable base

1. Airtable → base → **Share → Invite by email** → invite company email as **Owner**
2. Once accepted, demote yourself to Editor or remove access
3. Company account generates a new Airtable personal access token
4. Update `AIRTABLE_API_KEY` in Vercel env vars to the new token
5. `AIRTABLE_BASE_ID` stays the same — it does not change on ownership transfer

---

## Step 6 — Transfer Resend (email delivery)

The sender domain is `woodwings.ae` (`notifications@woodwings.ae`). Resend ties domain verification to an account via DNS records.

1. Create Resend account under company email
2. Add `woodwings.ae` domain → Resend provides new DNS TXT/DKIM records
3. Update those DNS records (replacing old Resend records) to point to the new account
4. Generate new API key in the new Resend account
5. Update `RESEND_API_KEY` in Vercel env vars
6. Delete the domain from the old Resend account

---

## Step 7 — Smoke test on staging

Before production cutover:
1. Sync staging: `git push origin main:staging`
2. Vercel auto-deploys the `staging` branch as a Preview deployment
3. Open the Vercel preview URL for the staging branch
4. Test: login as each role, load tasks, load calendar, send a test email (`/api/admin/test-email`)
5. Test cron auth: `curl -H "Authorization: Bearer <CRON_SECRET>" https://staging-url/api/cron/weekly-reminder`

---

## Step 8 — Production cutover & cleanup

1. Confirm staging is fully working
2. Push to main → Vercel auto-deploys production
3. Verify: login works, data loads, accountant email arrives at `accountant@woodwings.ae`
4. Remove personal accounts from all services (GitHub collaborator, Vercel member, Airtable owner, Turso member, Resend account)

---

## Verification Checklist

- [ ] Login as all 5 roles on staging → everything loads
- [ ] Trigger a payment → accountant email arrives at company address
- [ ] GitHub Actions tab on new repo → cron workflows run successfully
- [ ] `turso db list` on company org shows both production and staging DBs
- [ ] Personal accounts no longer have access to any service
