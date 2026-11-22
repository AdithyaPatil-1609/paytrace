/**
 * Phone number check for sign-up. The browser proves the number with a
 * Firebase SMS code and sends us the Firebase ID token it got back. Here we
 * check that token ourselves: Google's signature (keys published for
 * securetoken@system.gserviceaccount.com), our project as audience and
 * issuer, not expired, signed in with "phone", and the code entered in the
 * last 10 minutes. Only then is the number trusted.
 */
import { OAuth2Client } from "google-auth-library";

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let cache: { certs: Record<string, string>; until: number } | null = null;

export function firebaseProjectId(): string | null {
  const id = process.env.FIREBASE_PROJECT_ID;
  return id && /^[a-z0-9-]{4,40}$/.test(id) ? id : null;
}

async function certs(): Promise<Record<string, string>> {
  if (cache && cache.until > Date.now()) return cache.certs;
  const response = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Could not load Firebase keys");
  const body = await response.json() as Record<string, string>;
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cache = { certs: body, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return body;
}

/** An Indian or international number in E.164 form, like +919876543210. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** Returns the verified phone number, or null if the token is not acceptable. */
export async function verifiedPhoneFromToken(idToken: unknown): Promise<string | null> {
  const projectId = firebaseProjectId();
  if (!projectId || typeof idToken !== "string" || idToken.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) return null;
  try {
    const ticket = await new OAuth2Client().verifySignedJwtWithCertsAsync(idToken, await certs(), projectId, [`https://securetoken.google.com/${projectId}`]);
    const payload = ticket.getPayload() as (Record<string, unknown> & { firebase?: { sign_in_provider?: string } }) | undefined;
    const phone = payload?.phone_number;
    const authTime = Number(payload?.auth_time);
    if (typeof phone !== "string" || !E164.test(phone)) return null;
    if (payload?.firebase?.sign_in_provider !== "phone") return null;
    if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > 600) return null;
    return phone;
  } catch {
    return null;
  }
}
