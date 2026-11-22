/**
 * POST /api/sandbox/attack  {attack: "replay" | "tamper" | "stale" | "unknown"}
 * Runs one signed-phone attack against the real signature check.
 */
import { cookies } from "next/headers";
import { runSignedAttack, type SignedAttack } from "@/server/sandbox/attacks";
import { SANDBOX_COOKIE, newSandboxId, sandboxCookieOptions, validSandboxId } from "@/server/sandbox/session";
import { isFull, openSandbox } from "@/server/sandbox/store";
import { readJsonBody } from "@/server/security/body";
import { forbidden, fromOurSite } from "@/server/security/origin";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const ATTACKS: SignedAttack[] = ["replay", "tamper", "stale", "unknown"];

export async function POST(request: Request) {
  const hit = takeHit("sandbox", clientKey(request), LIMITS.sandbox);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  const read = await readJsonBody(request, 512);
  if (!read.ok) return Response.json({ error: read.error }, { status: read.status, headers });
  const attack = (read.value as { attack?: unknown } | null)?.attack;
  if (!ATTACKS.includes(attack as SignedAttack)) return Response.json({ error: "Unknown attack." }, { status: 400, headers });

  const jar = await cookies();
  const existing = jar.get(SANDBOX_COOKIE)?.value;
  const id = validSandboxId(existing) ? existing : newSandboxId();
  const box = openSandbox(id);
  if (isFull(box)) return Response.json({ error: "This sandbox is full. Reset it to start again." }, { status: 409, headers });
  const outcome = await runSignedAttack(box, attack as SignedAttack);
  jar.set(SANDBOX_COOKIE, id, sandboxCookieOptions());
  return Response.json(outcome, { headers });
}
