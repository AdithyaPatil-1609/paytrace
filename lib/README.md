# lib/

The logic behind the screens and routes. Most of it is plain TypeScript with no React, so it can be tested without a browser.

| Folder | What it does |
| --- | --- |
| `payments/` | The payment engine. `types.ts` defines a recurring payment (`Commitment`). `rules.ts` holds the shared thresholds (price rise, unused, trial). `engine.ts` groups charges from the demo CSVs. `analysis.ts`, `calendar.ts`, `notice-timing.ts`, `merchant-match.ts` and `recurring-check.ts` (local model second opinion) cover totals, schedules, late notices, merchant names and edge cases |
| `ingestion/` | Turning messages into payment events. SMS (`sms-message.ts`), Gmail (`email.ts`, `gmail-filter.ts`, `recurring-email.ts`, `subscription-email.ts`, `store-email.ts`), DKIM and phone signatures (`dkim.ts`, `signature.ts`, `device-auth.ts`), iPhone tokens and how much each source is trusted (`trust.ts`) |
| `accounts/` | Sign-in and the person's account: Google OAuth, sessions and encryption (`security.ts`), Gmail consent and sync, Firebase phone check, SMS consent, Family View |
| `statements/` | Bank statement import: CSV columns found by name (`csv.ts`), PDF tables read in the browser (`pdf.ts`, `read-file.ts`) |
| `assistant/` | Ask AI and the local models: which model to call (`models.ts`, local only), prompts, facts worked out in code (`facts.ts`), the bank-alert reader, and the secret filter that keeps OTPs away from any model (`secrets.ts`) |
| `presentation/` | Turning results into words for the UI: formatting, issue cards, cancel links and steps (`cancel-links.ts`), last-used lines, query graphs |
| `security/` | Request checks used by every API route: body size, origin and rate limits |
| `sandbox/` | The security sandbox's throwaway data and attack builders |
| `scenarios/` | What-if challenges on a finding |
| `data/` | `load-demo.ts`: picks live Neo4j data or the CSV fixture for the demo |
| `site.ts` | Site name, URL and shared metadata |

## Conventions

- Thresholds live once, in `payments/rules.ts`, and both the CSV engine and the Cypher queries read them.
- Anything that touches a model goes through `assistant/secrets.ts` first.
- Server-only modules (Node crypto, secrets) must not be imported by client components.
