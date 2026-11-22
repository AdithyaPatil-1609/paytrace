# web/components/

React UI. Pages in `web/app/` render these; logic lives in `server/`, so components stay about layout and interaction.

| Folder / file | What it holds |
| --- | --- |
| `dashboard.tsx` | The product shell: top bar, side navigation and the five screens. Used by both the demo and the signed-in account |
| `landing.tsx` | The public landing page and its sign-in drawer |
| `paytrace-logo.tsx` | The logo, used everywhere the brand appears |
| `account/` | Signed-in account: `account-dashboard.tsx` (loads the person's data, top bar menus, account menu), `account-login.tsx`, `family-access.tsx`, and the data connections: `statement-import.tsx` (Import CSV/PDF), `add-phone.tsx` (iPhone / Android chooser), `iphone-connect.tsx`, `phone-pairing.tsx` |
| `insights/` | Panels built from the person's graph: `subscription-watchlist.tsx`, `everyday-spending.tsx`, `graph-warnings.tsx`, `personal-graph-panel.tsx` |
| `screens/` | The five dashboard screens: All payments, Issues, Cancel paths, Annual, Evidence graph |
| `detail/` | The payment drawer: evidence, price history, cancellation guide, NPCI hand-off (`upi-cancel-link.tsx`) |
| `visualizations/` | Charts and diagrams: payment radar, sparklines, calendar, annual chart, evidence graph, query graphs |
| `chrome/` | Shared pieces of the frame: `bar-menu.tsx` (top bar dropdowns, click-outside to close), profile menu, mobile navigation, screen headers, text-size toggle |
| `signup/` | Sign-up flow, Firebase phone check, first-sync progress |
| `assistant/` | The Ask AI chat widget |
| `sandbox/` | The security sandbox console |
| `hooks/` | `use-payment-review.ts`: simulation state, decisions and their effect on the yearly total |

## Conventions

- A component that needs the browser starts with `"use client"`. Server-only code (Neo4j, secrets) never goes here.
- Shared styles live in `web/app/styles/`; class names are plain CSS, no CSS-in-JS.
- Import with the `@/components/...` alias, never long relative paths.
