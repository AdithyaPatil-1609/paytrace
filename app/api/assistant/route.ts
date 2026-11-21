/**
 * POST /api/assistant  { message, scope: "demo" | "account" }
 * One chat turn. The account scope reads the signed-in person's own payments;
 * the demo scope reads the same synthetic data as the public dashboard.
 * Models run on this machine only (lib/assistant/models.ts).
 */
import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { readLiveDashboard } from "@/db/neo4j/live";
import { SESSION } from "@/lib/accounts/security";
import { ask, MAX_MESSAGE } from "@/lib/assistant/assistant";
import { demoCommitments } from "@/lib/data/load-demo";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

// One model call at a time: a laptop GPU serves a queue better than a crowd.
// The line is capped, so a burst of visitors gets a quick "busy" answer
// instead of waiting minutes for a reply that would time out anyway.
const MAX_WAITING = 6;
let waiting = 0;
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>) {
  waiting += 1;
  const run = () => work().finally(() => (waiting -= 1));
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function POST(request: NextRequest) {
  const hit = takeHit("assistant", clientKey(request), LIMITS.assistant);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (waiting >= MAX_WAITING) {
    return Response.json(
      { error: "Ask AI is busy answering other people. Try again in a minute." },
      { status: 503, headers: { ...headers, "Retry-After": "30" } }
    );
  }

  let body: { message?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON with a message." }, { status: 400, headers });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type a question first." }, { status: 400, headers });
  if (message.length > MAX_MESSAGE) {
    return Response.json({ error: `Keep it under ${MAX_MESSAGE} characters.` }, { status: 400, headers });
  }

  let data: { items: Awaited<ReturnType<typeof demoCommitments>>["items"]; asOf: string };
  try {
    if (body.scope === "account") {
      const user = await accountForSession(request.cookies.get(SESSION)?.value);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
      const { summary } = await readLiveDashboard(user.profile);
      data = { items: summary.commitments, asOf: summary.asOf };
    } else {
      data = await demoCommitments(body.scope === "demo-static");
    }
  } catch {
    return Response.json({ error: "Payment data is unavailable right now." }, { status: 503, headers });
  }

  const reply = await inTurn(() => ask(message, data.items, data.asOf));
  return Response.json(reply, { headers });
}
