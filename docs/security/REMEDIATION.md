# Security remediation log (card S9)

What was found, what we fixed, what is left and why. Findings and fixes only; never real data, keys or tokens.

## ArgosX scans

| Scan | When | Address | Result | Report |
| --- | --- | --- | --- | --- |
| Baseline | 21 Nov, 9:09 pm | https://paytrace.co.in | VibeScore 97/100 · Security 100 · Accessibility 100 · Performance 100 · UX 88 · public surface clean, 4 low findings | ArgosX v2.0.336, 2 pages crawled, report PDF kept by Hanish |
| Final | 22 Nov, by 11:00 am, frozen build | https://paytrace.co.in | _to fill in_ | _link or file name_ |

### Findings from the scans

| ID | Severity | Finding | Fix | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | Low (seo) | Missing Open Graph description, image, title | Site-wide Open Graph and Twitter tags; a 1200×630 preview image | Hanish | Fixed: `app/layout.tsx`, `app/opengraph-image.tsx` |
| A2 | Low (seo) | Missing canonical link | A canonical link on every public page; account page set to noindex | Hanish | Fixed: page `metadata` in `app/page.tsx`, `app/demo`, `app/signin`, `app/privacy` |
| A3 | Low (seo) | No /sitemap.xml | `/sitemap.xml` with the four public pages; `/robots.txt` keeps `/api/` and `/account` out of search | Hanish | Fixed: `app/sitemap.ts`, `app/robots.ts` |
| A4 | Low (ux) | "paytrace" looks like two words run together | None: it is our brand wordmark | — | Accepted (intentional) |

Nothing was found in the checks for exposed secrets, security headers, cookies, CORS, TLS, database or API exposure, or broken links. The free scan covers the public surface only; signed-in flows are covered by our own tests (`tests/security/`, `tests/cypher/`) and the manual checks below.

## Fixes made before the scans (our own review)

| ID | Threat | Fix | Where | Test |
| --- | --- | --- | --- | --- |
| F1 | Fake phone or stolen shared code sends SMS | Each phone pairs with a one-time code and signs every request with its Android Keystore P-256 key | `lib/ingestion/signature.ts`, `lib/ingestion/device-auth.ts`, `app/api/devices/*` | `tests/security/device-signature.test.ts` |
| F2 | Replay of a captured request | Time within 5 minutes plus a one-use number remembered for 10 minutes; a nonce is used only after the signature passes | `lib/ingestion/nonce-store.ts` | same |
| F3 | One person's SMS seen by another | Signed SMS go to the phone owner's own profile, not a shared store | `app/api/ingest/sms/route.ts` | same |
| F4 | Body tampering (e.g. Rs 199 → Rs 1,99,999) | The signature covers the exact body bytes | `lib/ingestion/signature.ts` | same |
| F5 | AI makes up or is tricked into a value | Every field must appear word for word in the message, or it is removed | `lib/assistant/verify-fields.ts` | `tests/security/ai-reader-checks.test.ts` |
| F6 | Prompt injection in a message | Messages giving orders to an AI are dropped before any model sees them | `lib/assistant/verify-fields.ts` | same |
| F7 | Cross-site request forgery on Ask AI, Simulate, Challenge | Sec-Fetch-Site and Origin must be our own site | `lib/security/origin.ts` | `tests/security/web-checks.test.ts` |
| F8 | Huge request bodies | Size checked from the header and again after reading, before parsing | `lib/security/body.ts` | same |
| F9 | Script injection, framing, data in caches | Full Content Security Policy, frame-ancestors none, form-action limited to us and Google, no-store on every API answer | `next.config.ts` | same |
| F10 | Stolen session cookie used elsewhere | "Sign out on every device" ends every session of the person | `app/api/auth/logout/route.ts`, `db/neo4j/accounts.ts` | manual (S10) |
| F11 | Lost or sold phone | "Remove all paired phones" deletes their keys and clears this server's cache at once | `app/api/devices/remove/route.ts` | manual |
| F12 | Encryption key leak or rotation | Sealed Gmail tokens carry a key version; a previous key is still read during rotation | `lib/accounts/security.ts` | `tests/security/token-keys.test.ts` |
| F13 | Poisoned GitHub Action or package | Actions pinned to commit SHAs, read-only token, no persisted credentials, Gitleaks, OSV-Scanner and npm audit in CI | `.github/workflows/ci.yml` | CI |
| F14 | Bad deploy | Pull-based deploy only of commits that passed CI; health check with automatic rollback; DEPLOY_FREEZE | `scripts/deploy/deploy.sh` | rehearsed rollback |
| F16 | Data kept after the person leaves | "Delete my data" removes their payments, events, merchants, phones, sessions and account in one transaction, and revokes Gmail at Google | `db/neo4j/delete-user.ts`, `app/api/account/delete/route.ts` | `tests/cypher/devices-and-delete.test.ts` |
| F15 | Brute-forcing pairing codes | 5 tries a minute, 20 an hour per address; 8 characters from 31; single use; 10 minutes | `lib/security/rate-limit.ts` | `eval/hostile.csv` H42 |

Earlier fixes already in main: Next.js 16.4.6, request limits on every public route, size checks on SMS, same-origin checks on sign-in and Gmail routes, OAuth state + nonce + PKCE, Gmail tokens sealed with AES-256-GCM, HttpOnly Secure SameSite=Lax cookies, bank sender header (DLT) check, OTP filter, real data in `.gitignore`, full-history Gitleaks scan with no leaks.

## Load test (card S11)

Production build on a 4-core Linux test copy, 21 Nov, about 9:45 pm. Repeat on the laptop before judging.

| Target | Load | p50 | p95 | p99 | Result |
| --- | --- | --- | --- | --- | --- |
| `GET /` (landing) | 50/s for 20 s (1,000) | 5 ms | 7 ms | 13 ms | 1,000 × 200 |
| `POST /api/ingest/sms`, unsigned | 50/s for 15 s (750) | 4 ms | 6 ms | 12 ms | 30 × 401, then 720 × 429: the limit holds; nothing stored |

## Manual checks

- **Two accounts (S10):** sign in as A and B in two browsers. Copy every id from A's requests (`/api/account/summary`, Ask AI with scope account) into B's. B must only ever see B's data, because every query takes the person from the session, never from the request.
- **Sign out everywhere:** sign in on two browsers, use "Sign out on every device" on one; the other must land on the sign-in page at its next request.
- **Phone removal:** pair a phone, send one SMS, press "Remove all paired phones", send again: 401.
- **Rollback rehearsal:** `scripts/deploy/deploy.sh rollback`, check the previous version answers, then remove `DEPLOY_FREEZE`.

## Accepted for the hackathon, with the reason

| Item | Why it is acceptable now | Production fix |
| --- | --- | --- |
| CSP allows `'unsafe-inline'` scripts | Next.js inlines its start-up scripts; nonces need every page rendered per request, too risky to switch 13 hours before judging | Per-request nonces in `proxy.ts` with `'strict-dynamic'` |
| Request limits and nonces live in memory | One server process on one laptop | Redis (`SET NX PX`) shared by all servers |
| Old shared pairing code still accepted | Phones without the signing update must keep working for the demo | `PAYTRACE_ALLOW_DEVICE_CODE=false` once every phone is signed |
| Google Fonts loaded from Google | Visitor IP reaches Google when the page loads | Self-host the fonts with `next/font` |
| Gmail limited to approved test users | Google's restricted-scope review (CASA) takes weeks | Complete Google's security assessment |
| No outside penetration test | Time | Outside test before launch; DPDP breach-reporting runbook |
