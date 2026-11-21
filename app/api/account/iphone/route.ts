/**
 * Connect or disconnect the signed-in person's iPhone (plan card U4).
 * POST makes a new personal token (replacing any old one) and returns it once;
 * only its hash is stored. POST with action=disconnect removes it.
 */
import { NextRequest } from "next/server";
import { accountForSession, removeIosToken, setIosToken } from "@/db/neo4j/accounts";
import { newIosToken } from "@/lib/ingestion/ios-token";
import { sameOrigin, SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const hit = takeHit("iphone-token", clientKey(request), LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return json({ ok: false, error: "Forbidden" }, 403);
  const action = new URL(request.url).searchParams.get("action");
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return json({ ok: false, error: "Sign in first" }, 401);
    if (action === "disconnect") {
      await removeIosToken(user.sub);
      return json({ ok: true, connected: false });
    }
    const token = newIosToken();
    await setIosToken(user.sub, token);
    return json({ ok: true, connected: true, token });
  } catch {
    return json({ ok: false, error: "iPhone connection unavailable; retry" }, 503);
  }
}
