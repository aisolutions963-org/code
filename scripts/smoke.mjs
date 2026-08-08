#!/usr/bin/env node
// Post-deploy smoke check: confirm a freshly-deployed app actually serves its public
// login page (HTTP 200), not just that the edge is up.
//
// Vercel deployments sit behind Deployment Protection (SSO): an unauthenticated request
// is redirected to the login wall BEFORE the app runs, so it can't tell a healthy app
// from a crashed one. We reach the real app with a Protection Bypass token.
//
// Usage:  node scripts/smoke.mjs <deployment-url>
// Env:    VERCEL_AUTOMATION_BYPASS_SECRET  (Vercel → Settings → Deployment Protection →
//                                           Protection Bypass for Automation)
//
// Exit 0 = healthy (or skipped when no token). Exit 1 = deploy is not serving /login.

const rawUrl = process.argv[2]
const token = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

if (!rawUrl) {
  console.error('smoke: no deployment URL given. Usage: node scripts/smoke.mjs <url>')
  process.exit(1)
}

// Accept a bare host or a full URL; always hit the public /login page.
const base = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
const target = `${base.replace(/\/+$/, '')}/login`

if (!token) {
  // A check behind the SSO wall is meaningless, so self-skip (green) rather than give a
  // false sense of safety — exactly how the schema-contract/integration jobs behave.
  console.log('smoke: skipped — VERCEL_AUTOMATION_BYPASS_SECRET not set.')
  console.log('       Add it (Vercel Protection Bypass for Automation) to enable the real /login check.')
  process.exit(0)
}

const MAX_ATTEMPTS = 3
const PER_ATTEMPT_TIMEOUT_MS = 15_000
const BACKOFF_MS = 5_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probe() {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      redirect: 'manual', // a 3xx means we're still hitting the protection wall, not the app
      signal: controller.signal,
      headers: {
        'x-vercel-protection-bypass': token,
        'x-vercel-set-bypass-cookie': 'true',
      },
    })
    return { status: res.status }
  } finally {
    clearTimeout(t)
  }
}

console.log(`smoke: checking ${target}`)
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    const { status } = await probe()
    if (status === 200) {
      console.log(`smoke: ✓ /login returned 200 (attempt ${attempt})`)
      process.exit(0)
    }
    console.log(`smoke: attempt ${attempt}/${MAX_ATTEMPTS} — got HTTP ${status} (want 200)`)
  } catch (err) {
    console.log(`smoke: attempt ${attempt}/${MAX_ATTEMPTS} — request failed: ${err?.message ?? err}`)
  }
  if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS)
}

console.error('smoke: ✗ deployment did not serve /login with HTTP 200 — the app may be down.')
process.exit(1)
