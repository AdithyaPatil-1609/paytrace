# Demo and deck

The judges' notes, and what answers each one:

| Note | Where it is answered |
| --- | --- |
| Product screens come before the graph in the deck | The app opens on **Screen 00 · Evidence graph** in live mode, and the rebuilt deck opens on the graph: slides 2–5 before any product screen (below). |
| "Subscription finder" is a known category | Lead with the missing-edge finding, not with a list of subscriptions. Talking points below. |
| CSV can render the same screens | Screen 00 has no CSV twin. It runs Cypher over relationships; offline it says there is no graph to read. |
| Dual engine; Cypher tests not as locked | One rule book (`lib/rules.ts`) passed into Cypher as `$rules`. `npm run test:cypher`: 14 checks, including field-by-field parity with the offline engine. In live mode, Simulate runs in Cypher too. |
| Judges may not run Aura | `docker compose up -d` gives a local Neo4j. CI runs the Cypher suite on a Neo4j container on every push. |
| Video decides functionality; the CSV clip scored lower | `npm run demo` records the live walkthrough and **fails** if the badge says CSV. |

## Record the video

```bash
docker compose up -d        # without Docker: see "Run it live" in the README
cp .env.example .env.local  # the local block is already filled in
npm run seed
npm run dev
```

In a second terminal:

```bash
npm run demo
```

The script writes `work/demo/paytrace-live.webm` and 12 numbered PNGs. Add `--headed` to watch it drive the browser. It stops with an error unless every one of these is on screen:

1. **Reading Neo4j** badge and the strip that says *Cypher decided the issues, the year, and each cancel path*.
2. **Screen 00**: the Spotify neighbourhood with the dashed `price_change × 0` node, the three findings, and the Cypher that ran.
3. **Screen 01**, then the Spotify row → **Evidence path · Neo4j** with the `silent_hike` finding.
4. **Simulate** answered by the graph: *“…then the transaction rolled back.”*
5. **Screens 02, 03, 04**, ending on **Decided in Neo4j**.

Voice-over the PNGs in that order if you'd rather screen-record by hand. Keep the badge in frame for the first 5 seconds.

## Shot list (about 2½ minutes)

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Badge + Neo4j strip | "This is reading a live Neo4j graph — 165 payments, 145 messages, 14 mandates." |
| 0:10 | Screen 00 header, census | "Bank lines, SMS, mandates and app opens are separate records. Here they're one graph." |
| 0:25 | Spotify neighbourhood | "Twelve Payments to Spotify. The price steps from 119 to 139. Twelve Messages are about Spotify — none is a price change. The harm is that missing edge." |
| 0:50 | Three findings, open one Cypher block | "Each finding is a pattern over relationships. A trial notice chained to a paid debit. ₹24,341 paid to merchants after she last opened them." |
| 1:15 | Screen 01, open Spotify → Evidence path | "Every row the product shows walks back to the graph." |
| 1:35 | Simulate | "A new autopay is written into Neo4j inside a transaction, Cypher finds it, and the transaction rolls back." |
| 1:50 | Screens 02 → 03 → 04 | "Issues, how to stop each one — service and money separately — and the year, decided in Neo4j." |
| 2:20 | Close on Screen 00 | "Not a subscription list: evidence that should exist and doesn't." |

## Deck order

The rebuilt deck (`Paytrace-deck.pptx`, submitted alongside this repository; 19 slides) follows this order. It replaces the earlier 16-slide PDF, which put the graph on slides 11–12, after the product screens:

- **Slide 1 · Cover** — *The harm is a missing edge.*
- **Slide 2 · The problem** — Spotify ₹119 → ₹139, twelve debit SMS, zero price-change messages, beside the Screen 00 neighbourhood.
- **Slide 3 · The graph model** — eight labels with counts, nine relationship types.
- **Slide 4 · Three Cypher findings** — silent hike, trial → paid, ₹24,341 paid after the last open, and the silent-hike query.
- **Slide 5 · Not a subscription finder** — the comparison below.
- **Slides 6–14 · The product** — the brief, detection rules, Priya's year, Screens 00–04, the Evidence path, Simulate in Neo4j, issues, cancel paths, the year.
- **Slides 15–17 · Engineering** — one rule book with two runners, the 41 checks and CI on Neo4j, running it locally.
- **Slides 18–19 · Next build, and the line** this prototype holds.

## Why it isn't a subscription finder

- Subscription finders typically list recurring debits found in the bank feed. Paytrace's findings exist only where sources **fail to join**: a step-up in payments with no `price_change` message; a mandate still live on a merchant with no recent opens.
- The answer to "how do I stop it" is two separate paths in the graph: the service (`Pattern` cancel copy) and the money (`Mandate` reference). Cancelling one does not stop the other.
- Everything runs against synthetic data and never sends a revoke, so there's no bank access and no automation risk.
