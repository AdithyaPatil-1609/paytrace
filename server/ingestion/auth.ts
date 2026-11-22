import { timingSafeEqual } from "node:crypto";

export function authorized(request: Request, header: string, expected: string | undefined) {
  const actual = request.headers.get(header);
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function liveProfile() {
  const profile = process.env.PAYTRACE_LIVE_PROFILE;
  if (process.env.PAYTRACE_LIVE_ENABLED !== "true" || !profile || !/^[A-Za-z0-9_-]{1,64}$/.test(profile)) return null;
  return profile;
}
