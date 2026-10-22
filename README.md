# Paytrace

Paytrace reads one synthetic year of statements, SMS, and email and turns it into five screens: the year, every payment, the merchant string in plain language, the rows that changed or went unused, and a cancel path for each one. It never connects to a bank, a phone, or a mailbox, and it never sends a revoke. It shows the path. The person still takes the step.

Priya Demo is invented. Arclight Bank is invented. The as-of date is 22 October 2026.

## What is computed, not written down

Nothing in the app names a merchant. `lib/engine.ts` reads the CSV fixture and derives every commitment:

| Step | Rule |
| --- | --- |
| Group | Narration matched against the hand-written dictionary, longest pattern wins, then grouped with the account. `PAYPAL *SPOTIFY` never collapses into `SPOTIFY`. |
| Keep | Two debits, or one debit under a live mandate. One Swiggy order and one transfer to Rahul fail both tests and are dropped. |
| Rhythm | Median gap between debits: weekly, monthly, quarterly, annual. If the gaps scatter by more than 35% of that median, the row is irregular, so society's uneven dates still count. |
| Amount | One price is fixed. One price then another that stays is a step. Anything else is variable, so electricity between ₹900 and ₹3,200 stays one commitment. |
| Year | Fixed and stepped rows project the latest charge forward, a variable row projects its median, an irregular row sums what actually left, and an annual row is charged once. |
| Signals | `silent_hike` when a price steps up and no price-change message exists, `trial_converted` from a trial-ending notice, `zombie` after 90 days unopened, plus variable amount, irregular interval, annual next date, and obligation. |
| Split | Five buckets: unused, review, still used, bills, debt. |

Credits are never commitments, and YouTube's ₹1 authorisation is attached to YouTube as evidence rather than counted as its own price.

## The five screens

1. **Annual** – the next twelve months split five ways, with the unused part and the EMI called out separately.
2. **All payments** – every row with the raw bank string, the month, the year, and whether the message was SMS or email. Simulate new autopay lives here.
3. **Plain language** – the dictionary match, and what the string actually is. An unmatched string stays unknown rather than being guessed at.
4. **Issues** – only the rows that changed or went unused, with the full year still on screen as context.
5. **Cancel paths** – two tracks per row, stop the service then stop the money, and a line for when the merchant never replies. The gym's two-month pause leaves the mandate active and the year unchanged; only a confirmed revoke moves the number. The loan has no revoke control.

Any row on any screen opens a detail panel: the statement lines that proved it, the notices beside it (and a price-change count of **none** where that absence is the finding), last opened, the mandate, and the sentence explaining why the grouping kept it.

## Simulate new autopay

The button does not append a finished commitment. It appends the rows a real new mandate would leave behind — one statement line, one UPI mandate, two SMS — and detection runs again. Headspace is found the same way every other row is found. The year moves from ₹1,99,138 to ₹2,02,726. Reset removes it, and a second click never adds a second copy.

## Export

One export, CSV only: `↓ Export CSV` writes every visible commitment with its narration, plain name, rhythm, amount pattern, year, bucket, signals, dates, and cancel copy. There is no import: the fixture is the repository's own CSV, so nothing is uploaded.

## Stack and structure

- `data/raw/` – the fixture as CSV: statement, notifications, usage, mandates, the merchant dictionary, the PayPal parser fixtures, and the expected answers.
- `lib/` – the CSV reader, the fixture loader, the detection engine, and the analysis helpers.
- `components/` – the five-screen prototype, the detail panel, and the CSV export.
- `db/neo4j/` – the graph schema, seed, driver, and query. Detection is the source of truth in this build; the graph is kept because the product after this one reads real statements, and it already models person, account, narration, merchant, commitment, notice, and mandate.
- `tests/` – seventeen checks, including the nine the brief says the prototype is done when it passes.

## Run locally

1. `npm install`
2. `npm run dev`, then open `http://localhost:3000`.

No environment variables are needed. Copy `.env.example` to `.env.local` only if you want the optional Neo4j overlay.

## Verify

`npm test` runs the fixture checks: the silent hike, the converted trial, the eleven-month gym, the Swiggy row that is not a commitment, the two PayPal commitments, variable electricity, irregular society, the loan with no cancel action, and the year adding to ₹1,99,138. `npm run build` produces a production build.
