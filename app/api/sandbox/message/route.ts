/**
 * POST /api/sandbox/message  {channel: "sms" | "email", sender, text}
 * Runs one synthetic or typed message through the real checks and the AI
 * reader into the visitor's own sandbox, and returns the step-by-step trace.
 */
import { cookies } from "next/headers";
import { after } from "next/server";
import { syncSandboxGraph } from "@/db/neo4j/sandbox-graph";
import { processSandboxMessage } from "@/lib/sandbox/pipeline";
import { SANDBOX_COOKIE, newSandboxId, sandboxCookieOptions, validSandboxId } from "@/lib/sandbox/session";
import { isFull, openSandbox } from "@/lib/sandbox/store";
import { SANDBOX_LIMITS } from "@/lib/payments/rules";
import { readJsonBody } from "@/lib/security/body";
import { forbidden, fromOurSite } from "@/lib/security/origin";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const hit = takeHit("sandbox", clientKey(request), LIMITS.sandbox);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();

  const read = await readJsonBody(request, SANDBOX_LIMITS.maxBodyBytes);
  if (!read.ok) return Response.json({ error: read.error }, { status: read.status, headers });
  const input = (read.value ?? {}) as Record<string, unknown>;
  const channel = input.channel === "sms" || input.channel === "email" ? input.channel : null;
  if (!channel || typeof input.sender !== "string" || typeof input.text !== "string" || input.sender.length > 80 || input.text.length > 5000) {
    return Response.json({ error: "Send channel (sms or email), sender and text." }, { status: 400, headers });
  }

  const jar = await cookies();
  const existing = jar.get(SANDBOX_COOKIE)?.value;
  const id = validSandboxId(existing) ? existing : newSandboxId();
  const box = openSandbox(id);
  if (isFull(box)) return Response.json({ error: "This sandbox is full. Reset it to start again." }, { status: 409, headers });

  const outcome = await processSandboxMessage(box, { channel, sender: input.sender, text: input.text });
  if (outcome.accepted) { try { after(() => syncSandboxGraph(box)); } catch { void syncSandboxGraph(box).catch(() => undefined); } }
  jar.set(SANDBOX_COOKIE, id, sandboxCookieOptions());
  return Response.json(outcome, { headers });
}
