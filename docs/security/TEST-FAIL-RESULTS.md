# Test-fail cases: results (card S8)

Run on 22 November 2026, after midnight, on `main` with the security and sandbox work merged.
Automated suite: **203 tests pass, 0 fail** (`npm test`). The Neo4j tests in `tests/cypher/` run in CI's Cypher job, on a real Neo4j.
Every case is also listed in `ai/eval/hostile.csv`; most can be tried by hand in `/sandbox` → "Try to break it".

| # | Case | Expected | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | An OTP message | Dropped on the phone; never reaches the server or a model | **Pass** | Android filter; server: "an OTP message never reaches the model", "a secret never reaches a model" |
| 2 | The same SMS twice | Counted once | **Pass** | "read fields become a PaymentEvent, and the same SMS twice gets one ID"; sandbox "the same SMS twice is saved once" |
| 3 | Two real payments, same amount, same day | Kept as two, or sent to the person to confirm | **Pass** | `tests/live-ingestion.test.ts` (different reference → `review`, not merged); `tests/cypher/live-ingestion.test.ts` |
| 4 | "Ignore your rules" text | No false fields; message dropped | **Pass** | "messages that give orders to the AI are dropped, never read"; "an amount the model invented is removed before storing" |
| 5 | A 20 KB body, or broken JSON | 413 or 400; server stays up | **Pass** | "ingest/sms refuses a large body before checking the device", "refuses broken JSON"; "large or broken bodies are refused before parsing"; iPhone route same |
| 6 | An old or replayed signed request | Refused | **Pass** | "the same signed request sent twice is refused as a replay" (409), "a request older or newer than five minutes is refused" (401) |
| 7 | A normal phone number claiming to be a bank | Dropped | **Pass** | "ingest/sms refuses a normal phone number posing as a bank"; iPhone: "the Shortcut body refuses phone numbers" |
| 8 | A date in the future, or a wrong amount | Refused, or the value removed | **Pass** | `tests/ingest-sms.test.ts` (30 minutes in the future refused); "an amount the model invented is removed" |
| 9 | Qwen is down | Gemini with consent, otherwise "could not read" | **Partial** | "Could not read" works and nothing is guessed ("when Qwen is down, nothing is guessed", retries in "Qwen down and Neo4j down are retried"). The Gemini fallback with consent (card U2) is not built, so cloud AI is never used. |
| 10 | AuraDB is down | Clear message; demo still works | **Pass** | "when the demo database is down the demo shows the CSV sample, never personal data"; the account page shows "Neo4j unavailable"; SMS are retried |
| 11 | The Gmail token expired | A clear "Reconnect Gmail" message | **Pass** | `gmail-reconnect` in `tests/accounts.test.ts`; the account menu shows "Reconnect Gmail" |
| 12 | Two accounts | B never sees or changes A's data | **Pass (automated) / run S10 live** | `tests/cypher/account-isolation.test.ts`; "a notice linked to one account cannot clear another account's warning"; live check: `scripts/two-account-check.ts` |
| 13 | A request from another website | 403 | **Pass** | "account endpoints reject anonymous reads and cross-origin authorization"; "requests from another website are refused" |
| 14 | Delete my data | Nothing of the person remains; others untouched | **Pass (CI)** | `tests/cypher/devices-and-delete.test.ts` |
| 15 | Idle or old session | Ends after a day idle; rotated after 12 hours | **Pass (CI)** | `tests/cypher/sessions.test.ts` |

## Still open

- **Gemini fallback with consent (case 9):** card U2. Until it exists, the honest answer is "could not read", which is what the product does.
- **S10 on the live site:** run `scripts/two-account-check.ts` with two real sessions before judging, and paste its output below.

```
(paste the PASS/FAIL output of scripts/two-account-check.ts here)
```
