# web/app/

The Next.js App Router: every page, every API route and the stylesheets.

## Pages

| Route | File | What it is |
| --- | --- | --- |
| `/` | `page.tsx` | Landing page with the sign-in drawer |
| `/signin` | `signin/page.tsx` | Redirects to `/` with the sign-in drawer open |
| `/signup` | `signup/page.tsx` | Sign-up steps: Google, phone check (Firebase), Gmail, SMS |
| `/account` | `account/page.tsx` | The signed-in dashboard (`web/components/account/account-dashboard.tsx`) |
| `/consent/gmail` | `consent/gmail/page.tsx` | What Gmail access means, before Google's permission screen |
| `/family`, `/family/accept` | `family/` | Family View: share a read-only list of payments |
| `/demo` | `demo/page.tsx` | Synthetic demo for evaluators, with the "try it" console |
| `/sandbox` | `sandbox/page.tsx` | Security sandbox: "Try to break it" |
| `/privacy` | `privacy/page.tsx` | Privacy policy. Keep it in step with what the code really does |

`layout.tsx` holds the shared HTML shell and fonts. `robots.ts`, `sitemap.ts`, `icon.svg` and `opengraph-image.tsx` cover search and share previews.

## API routes (`api/`)

Every route that changes data checks the session, the request origin and the body size (`server/security/`).

| Group | Routes | Purpose |
| --- | --- | --- |
| `auth/` | `google/start`, `google/callback`, `logout` | Google sign-in and sign-out |
| `account/` | `summary`, `gmail/sync`, `gmail/disconnect`, `statement`, `iphone`, `onboarding`, `delete`, `warnings`, `graph`, … | The signed-in person's data and settings |
| `ingest/` | `sms`, `ios`, `usage` | Signed bank SMS from Android, iPhone Shortcut SMS, Android screen time |
| `devices/` | `pairing-code`, `pair`, `remove`, `alerts` | Pairing and unpairing the Android companion |
| `family/` | `invite`, `accept`, `revoke`, `leave`, `summary`, … | Family View invitations and access |
| `assistant/` | `/`, `status` | Ask AI (local Qwen) and model health |
| `graph/`, `live/`, `simulate`, `challenge` | | Evidence graph, demo data and what-if scenarios |
| `sandbox/` | `attack`, `message`, `statement`, `reset` | The security sandbox's throwaway data |

## Styles

`globals.css` is the only stylesheet entry point. It imports the files in `styles/` in cascade order: `foundation.css` (tokens, text scale) first, then one file per screen or shared part, with `responsive*.css` and `refresh.css` last. Page-specific CSS for account, sign-up and family lives next to those pages.
