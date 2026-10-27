import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 9 only reads flat config, which is why `npm run lint` exited before
 * linting anything: there was no eslint.config.* in the repository.
 *
 * Next's TypeScript preset is loaded only if it can be: it requires the
 * `typescript-eslint` package, which is not currently a dependency. Install it
 * with `npm i -D typescript-eslint` and those rules switch on by themselves,
 * with no change needed here.
 */
let nextTypescript = [];
try {
  nextTypescript = (await import("eslint-config-next/typescript")).default;
} catch {
  // typescript-eslint is absent. The core web vitals rules still apply.
}

const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"]
  },
  ...nextCoreWebVitals,
  ...nextTypescript
];

export default config;
