# scripts/

Command-line tools. Each runs on plain Node with `tsx` and loads `.env.local` through `load-env-local.ts`. Run them from the repo root.

| Script | Command | What it does |
| --- | --- | --- |
| `seed-neo4j.ts` | `npm run seed` | Load the synthetic demo into the demo Neo4j database (refuses the main database) |
| `seed-agent-knowledge.ts` | `npm run agent:seed` | Load the public merchant catalog into the Aura Agent database |
| `gmail.ts` | `npm run gmail:authorize`, `npm run gmail:sync` | Desktop Gmail test: authorize once, then poll. Never logs email text or tokens |
| `gmail-accounts.ts` | `npm run gmail:accounts` | Background worker that syncs every signed-in account that agreed to Gmail |
| `eval-assistant.ts` | `npm run ai:eval` | End-to-end check of Ask AI on the demo payments (needs Ollama with `qwen3:14b`) |
| `read-message.ts` | `npm run ai:read -- "<made-up SMS>" <sender>` | Try the bank-alert reader on one message. Use made-up text only |
| `demo-live.ts` | `npm run demo` | Record the live walkthrough with Playwright |
| `backfill-similar.ts` | `npx tsx scripts/backfill-similar.ts` | One-off: add SIMILAR merchant links to old records. Dry run unless `--write`; local database only unless `--allow-remote` |
| `load-test.ts` | `npx tsx scripts/load-test.ts` | Short load test of the request limits |
| `two-account-check.ts` | `npx tsx scripts/two-account-check.ts` | Check that two signed-in people never see each other's data |
| `load-env-local.ts` | (imported) | Loads `.env.local` for scripts and Cypher tests |

## deploy/

`deploy/deploy.sh` and `deploy/ecosystem.config.cjs` are the pull-based deploy for a laptop server with pm2. Once a minute it asks GitHub for the newest commit on `main`, and builds and switches to it only after CI has passed on that exact commit. The site listens on `127.0.0.1` only, and a Cloudflare tunnel is the single way in from the internet.

The live paytrace.co.in machine uses the same idea with macOS launchd agents and a release folder outside the repo, so the running version never depends on a working checkout.
