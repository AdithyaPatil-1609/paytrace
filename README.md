# Paytrace

Paytrace finds every recurring payment a person makes (subscriptions, UPI AutoPay, card mandates, EMIs, SIPs and bills), shows why a charge was flagged, and explains how to stop it. It runs live at **[paytrace.co.in](https://paytrace.co.in)** on real accounts. A synthetic demo is available at `/demo`.

Paytrace reads from sources the person chooses to connect:

- **Gmail** (read-only): receipts, renewal and price-change notices.
- **Bank SMS**: from the Android companion app, or an iPhone Shortcut.
- **Bank statements**: CSV or PDF, read in the browser.
- **App screen time** (Android): when each paid app was last opened.

Payment fields are extracted by rules and by a local Qwen model. Message text is never stored, OTP/PIN/password messages never reach a model, and no data goes to an outside AI service.

## Project map

| Folder | What it holds | README |
| --- | --- | --- |
| `app/` | Next.js pages, API routes and stylesheets | [app/README.md](app/README.md) |
| `components/` | React UI: dashboard, screens, account menus, charts | [components/README.md](components/README.md) |
| `lib/` | Core logic: payment engine, ingestion, accounts, assistant, security | [lib/README.md](lib/README.md) |
| `db/neo4j/` | Neo4j graph: Cypher queries, writes, warnings, Aura Agent | [db/neo4j/README.md](db/neo4j/README.md) |
| `data/` | Synthetic demo data and the CSV fixture loader | [data/README.md](data/README.md) |
| `android/` | Paytrace Companion (Android): bank SMS and screen time | [android/README.md](android/README.md) |
| `ml/` | Local Qwen model work: prompts, LoRA adapters, evaluations | [ml/README.md](ml/README.md) |
| `scripts/` | Seeding, Gmail tools, evaluations, deployment | [scripts/README.md](scripts/README.md) |
| `tests/` | Unit, security and live-graph (Cypher) tests | [tests/README.md](tests/README.md) |
| `docs/` | Setup guides, security reviews and design notes | [docs/README.md](docs/README.md) |
| `eval/` | `hostile.csv`: the attack cases the security tests and sandbox cover | |

## Run it locally

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local      # fill in your own values; never commit this file
docker compose up -d --wait     # local Neo4j (optional)
npm run seed                    # synthetic demo data into the demo database
npm run dev                     # http://localhost:3000
```

Without database settings the app falls back to the bundled CSV demo. For Google sign-in, Gmail consent and background sync, see [docs/ACCOUNT-GMAIL.md](docs/ACCOUNT-GMAIL.md).

### Local AI models (optional)

| Model | Used for | Start it |
| --- | --- | --- |
| `qwen3:14b` on Ollama | Ask AI answers and optional email reading | `ollama serve` (port 11434) |
| Qwen3 8B + alerts adapter | Reading a pasted bank alert | `npm run ai:alerts` (port 8080) |
| Qwen3 8B + recurring adapter | Second check on recurring payments | `npm run ai:recurring` (port 8081) |

The app only talks to models on the same machine. Details are in [ml/README.md](ml/README.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit and security tests (no database needed) |
| `npm run test:cypher` | Live-graph tests against a seeded **test** Neo4j database |
| `npm run seed` | Load synthetic demo data (refuses to write to the main database) |
| `npm run agent:seed` | Load the shared merchant catalog into the Aura Agent database |

All checks run in CI on every pull request (`.github/workflows/ci.yml`).

## How a finding travels through the code

1. **Ingest:** `app/api/ingest/*` and `lib/ingestion/` accept SMS, email and screen time. They check signatures and drop OTP messages.
2. **Store:** `db/neo4j/live.ts` and `db/neo4j/write.ts` write payment events into the person's own graph.
3. **Analyse:** `db/neo4j/queries/commitments.ts` groups charges into recurring payments, and `lib/payments/rules.ts` holds the shared thresholds (price rise, unused, trial).
4. **Show:** `components/dashboard.tsx` renders the five screens (All payments, Issues, Cancel paths, Annual, Evidence graph).
5. **Act:** `lib/presentation/cancel-links.ts` and `components/detail/` give the cancel steps and official links (NPCI UPI Help, bank e-mandate pages).

## Working rules

- Never commit `.env.local`, real messages, statements, logs or models trained on real data. Real data stays in the product; tests and training use made-up data only.
- OTP, PIN and password messages never reach a model. Only local models are used.
- Cypher is always parameterized. Destructive tests and seeds never run against production.
- Commit messages look like `area: change`. New files start with two or three lines on *why* they exist.
- Open a pull request into `main`; CI must pass before merging.
