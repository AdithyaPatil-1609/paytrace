# tests/

Node's built-in test runner with `tsx`. All test data is made up: no real messages, statements, accounts or tokens.

| Where | Command | Needs | Covers |
| --- | --- | --- | --- |
| `*.test.ts` | `npm test` | nothing | Payment engine, ingestion, accounts, statements (CSV and PDF), assistant, UI rendering |
| `security/` | `npm test` | nothing | Phone signatures, DKIM, consent, session limits, token keys, web checks, AI reader secret filter, sandbox |
| `cypher/` | `npm run test:cypher` | a seeded **test** Neo4j | Live-graph queries, account isolation, devices and delete, family, warnings, rollback |
| `fixtures/` | | | Made-up statement files used by the statement tests |

The attack cases in `../eval/hostile.csv` are what the security tests and the `/sandbox` page cover. Results are written up in `docs/security/TEST-FAIL-RESULTS.md`.

## Running the Cypher tests safely

Start a throwaway database and point `.env.local` at it, never at production:

```sh
docker compose up -d --wait
npm run seed
npm run test:cypher
```

The tests write and delete data, so they must never run against the live Aura database.

## Writing a test

- Name the file after what it checks (`statement-pdf.test.ts`).
- Start with a line saying what it checks and that the data is made up.
- Use made-up names and amounts, never anything copied from a real inbox or SMS.
