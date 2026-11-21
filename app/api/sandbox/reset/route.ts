/** POST /api/sandbox/reset: forgets this visitor's sandbox and its cookie. */
import { cookies } from "next/headers";
import { SANDBOX_COOKIE, validSandboxId } from "@/lib/sandbox/session";
import { resetSandbox } from "@/lib/sandbox/store";
import { forbidden, fromOurSite } from "@/lib/security/origin";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const hit = takeHit("sandbox", clientKey(request), LIMITS.sandbox);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  const jar = await cookies();
  const id = jar.get(SANDBOX_COOKIE)?.value;
  if (validSandboxId(id)) resetSandbox(id);
  jar.delete(SANDBOX_COOKIE);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
