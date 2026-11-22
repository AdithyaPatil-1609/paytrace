# Live SMS and email ingestion (private test mode)

The companion app and Gmail worker produce the same validated PaymentEvent. Incoming events use `LiveProfile`, `LiveEvent`, `LivePayment` and `LiveMerchant` labels; the existing synthetic dashboard is unchanged. The graph preserves each source separately. Exact shared reference, merchant, amount and date can connect a second source to an existing payment. Cross-source candidates with uncertain references are recorded for review, not counted twice. No raw message body is persisted.

## Local setup

Use a dedicated local database, synthetic messages/test mailbox, and do not enable real collection until the applicable hackathon approval and data-owner consent are obtained. The existing Android test-sender-only switch defaults to on. The receiver is debug-build-only. The program is a single-profile prototype, not a public multi-user financial application.

1. Copy `.env.example` to `.env.local`, configure `NEO4J_*`, set `PAYTRACE_LIVE_ENABLED=true`, `PAYTRACE_LIVE_PROFILE=demo-live`, and generate separate strong random `PAYTRACE_DEVICE_CODE` and `PAYTRACE_READ_CODE` (do not commit them). The live graph creates its schema on first write. Do not run the destructive demo seed on a personal database.
2. Run `npm run dev`. In the companion app enter the backend URL (emulator: `http://10.0.2.2:3000`; physical phone: private HTTPS endpoint) and pairing code. Keep test-sender-only on for test cases. Enable sending. Send a known-format test SMS. HTTP 200 now means the event is recorded or deduplicated, not merely logged. Failures return 503.
3. Query the protected summary from your terminal: `curl -H "x-paytrace-read: YOUR_READ_CODE" http://localhost:3000/api/live/summary`. Live data stays outside the public demo until an authenticated UI is approved. The summary includes latest revision, counts, existing recurring detection results and recent evidence. Missing account details or incomplete notice history are uncertain; no raw email/SMS is returned.

## Gmail OAuth and polling

Create a Google Cloud project, enable Gmail API, configure the OAuth consent screen and add your consenting **test** mailbox to test users. Create a Desktop app OAuth client. Set the client ID/secret in `.env.local` with `GMAIL_ALLOWED_DOMAINS` (comma-separated exact sender domains or suffixes, e.g. `.com,.in`). The default search covers financial words in message bodies as well as subjects. The allowlist checks the displayed From domain, not cryptographic proof of payment; receipts alone are not bank settlement guarantees. The desktop parser accepts plain-text receipts with explicit merchant, INR amount and reference or provider ID. HTML-only and unsupported formats are skipped.

Run `npm run gmail:authorize`, open the printed Google consent URL on the same laptop, and approve read-only access. The local loopback callback uses state and PKCE. Refresh token is written to the ignored `.paytrace-gmail-token.json`; never share it. `npm run gmail:sync` fetches matching recent mail. `npm run gmail:sync -- --watch` checks every 45 seconds after the previous sync. Optional `GMAIL_QUERY` limits the search. Stop with Ctrl+C; revoke access in Google account settings when finished. Google Pub/Sub push is a future option, not required for this polling prototype.

Synthetic email fixture format:

```text
Subject: Payment receipt
Merchant: TEST STREAMING
Amount paid: INR 199.00
Reference: REF123
Date: 2026-01-01
```

## Existing analysis and agent tools

`readLiveSummary` maps scoped graph records to the existing `detectCommitments` engine; this reuses its cadence, cost, notice and mandate logic. The offline fixture/Cypher demo remains unchanged. Uncertain matches are stored as `POSSIBLE_MATCH` relationships. `LIVE_QUERIES` in `neo4j/live.ts` contains fixed parameterized payment, evidence, event and review queries. Pass `$profile` server-side; never let the chatbot choose someone else's profile or run arbitrary Cypher.

For the proposed frontend, poll the protected summary through an authenticated server-side session and refresh when `revision` changes. Never put the read or device secret in browser JavaScript. The current frontend was deliberately not edited.

## Validation

`npm test`, `npm run typecheck`, `npm run lint`; `npm run test:cypher` with a local, disposable seeded Neo4j DB for graph integration. Android parser unit tests can run from Android Studio with the project's configured SDK. Use synthetic data until approved.
