# Paytrace

Paytrace turns a year of synthetic statement, SMS, and email fixtures into four useful views: every payment, plain-language merchant matching, issues, and a cancellation path for each autopay. It never connects to a bank, phone, or mailbox, and it never sends a revoke.

## Stack and structure

- `app/` - Next.js application shell and styles.
- `components/` - interactive four-screen Paytrace prototype and CSV export.
- `data/` - local fixture fallback so the prototype runs without secrets.
- `db/neo4j/` - the core graph schema, seed data, driver, and commitment query.
- `lib/` - analysis and formatting helpers.
- `tests/` - nine fixture checks from the prototype brief.

Neo4j is the source of truth when configured. The graph models a person, accounts, transaction narrations, merchants, services, commitments, notices, and mandates—so each UI explanation remains traceable to its underlying evidence.

## Run locally

1. Copy `.env.example` to `.env.local` and add a Neo4j database connection.
2. Apply `db/neo4j/schema.cypher`, then `db/neo4j/seed.cypher` using Neo4j Browser or `cypher-shell`.
3. Install dependencies with `npm install`.
4. Run `npm run dev`, then open `http://localhost:3000`.

Without Neo4j environment variables, the app uses the synthetic Priya fixture in `data/priya.ts`; this keeps the prototype reviewable before a database is provisioned.

## Verify

Run `npm test` for the fixture tests and `npm run build` for a production build.
