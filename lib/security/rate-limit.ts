/**
 * Per-person rate limits for the public routes.
 *
 * The app runs as one server process on this laptop behind a Cloudflare
 * tunnel, so an in-memory counter is enough. If the app ever runs as several
 * instances (Vercel, more than one server), move these counters to a shared
 * store such as Redis, or each instance will count on its own.
 */

type Window = { limit: number; ms: number };
type Hits = number[];

const buckets = new Map<string, Hits>();
const MAX_KEYS = 10_000;

/**
 * Who is asking. Behind the tunnel every request reaches the app from
 * 127.0.0.1, so Cloudflare's CF-Connecting-IP header names the real visitor.
 * That header is trustworthy only because `npm run start:public` listens on
 * 127.0.0.1, so nothing but the tunnel can reach the app and set it.
 */
export function clientKey(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  return ip.slice(0, 64);
}

/**
 * Records one hit for `key` on `route`, and says whether it is allowed under
 * every window. A refused hit is not recorded, so waiting always helps.
 */
export function takeHit(route: string, key: string, windows: Window[], now = Date.now()) {
  const id = `${route}:${key}`;
  const longest = Math.max(...windows.map((w) => w.ms));
  const hits = (buckets.get(id) ?? []).filter((at) => now - at < longest);

  for (const { limit, ms } of windows) {
    const inWindow = hits.filter((at) => now - at < ms);
    if (inWindow.length >= limit) {
      buckets.set(id, hits);
      const retryAfter = Math.max(1, Math.ceil((inWindow[0] + ms - now) / 1000));
      return { ok: false as const, retryAfter };
    }
  }

  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > MAX_KEYS) prune(now, longest);
  return { ok: true as const };
}

function prune(now: number, longest: number) {
  for (const [id, hits] of buckets) {
    if (!hits.some((at) => now - at < longest)) buckets.delete(id);
  }
  // Still too many distinct visitors: drop the oldest entries first.
  while (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value!);
}

/** The JSON answer for a refused hit, with the standard Retry-After header. */
export function tooMany(retryAfter: number, extra: Record<string, unknown> = {}) {
  return Response.json(
    { error: `Too many requests. Try again in ${retryAfter} seconds.`, ...extra },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
  );
}

/** Test helper: forget every counter. */
export function resetRateLimits() {
  buckets.clear();
}

export const LIMITS = {
  // A laptop answers one question at a time, roughly every 10 to 30 seconds.
  assistant: [
    { limit: 6, ms: 60_000 },
    { limit: 40, ms: 60 * 60_000 }
  ],
  // The phone sends one event per bank SMS.
  sms: [{ limit: 30, ms: 60_000 }],
  // Rolled-back Neo4j queries: cheap, but not free.
  graph: [{ limit: 20, ms: 60_000 }],
  // Each sync calls Gmail; Google's quota is per project, so one person must not use it up.
  gmailSync: [
    { limit: 5, ms: 60_000 },
    { limit: 60, ms: 60 * 60_000 }
  ],
  // Starting Google sign-in: slows down anyone hammering the login button or the flow cookie.
  signIn: [{ limit: 10, ms: 60_000 }],
  // The public sandbox: every message may wake the AI reader on this laptop.
  sandbox: [
    { limit: 20, ms: 60_000 },
    { limit: 300, ms: 60 * 60_000 }
  ],
  // Sign-up steps (phone code, consent answers): a person clicks a few times a minute at most.
  signup: [
    { limit: 15, ms: 60_000 },
    { limit: 100, ms: 60 * 60_000 }
  ],
  // Pairing a phone: a guessed pairing code gets very few tries.
  pairing: [
    { limit: 5, ms: 60_000 },
    { limit: 20, ms: 60 * 60_000 }
  ]
} satisfies Record<string, Window[]>;
