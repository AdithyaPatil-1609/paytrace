/** POST /api/sandbox/reset: forgets this visitor's sandbox and its cookie. */
import { cookies } from "next/headers";
import { SANDBOX_COOKIE, validSandboxId } from "@/server/sandbox/session";
import { resetSandbox } from "@/server/sandbox/store";
import { dropSandboxGraph } from "@/neo4j/sandbox-graph";
import { forbidden, fromOurSite } from "@/server/security/origin";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export async function POST(request: Request) {
  const hit = takeHit("sandbox", clientKey(request), LIMITS.sandbox);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  const jar = await cookies();
  const id = jar.get(SANDBOX_COOKIE)?.value;
  if (validSandboxId(id)) { resetSandbox(id); await dropSandboxGraph(id).catch(() => undefined); }
  jar.delete(SANDBOX_COOKIE);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
