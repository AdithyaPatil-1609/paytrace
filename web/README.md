# web/: the website (Next.js + React)

Everything people see in the browser. It is the Next.js project root, so `npm run dev` and `npm run build` run `next … web`.

| Path | What it holds | README |
| --- | --- | --- |
| `app/` | Pages (one folder per URL), API routes under `app/api/`, and all CSS under `app/styles/` | [app/README.md](app/README.md) |
| `components/` | React components: the dashboard frame, the five screens, the payment drawer, account menus, charts | [components/README.md](components/README.md) |
| `public/` | Static files: logo and brand images | |
| `site.ts` | Site name, description and address for metadata, sitemap and share image | |
| `next.config.ts` | Security headers, the www redirect, and loading `../.env.local` | |
| `tsconfig.json` | Extends the root `tsconfig.json`, so `@/` imports work the same everywhere | |

The logic the pages call lives outside this folder: `server/` (TypeScript), `neo4j/` (database) and `ai/` (local models). Pages and components stay about layout and interaction.
