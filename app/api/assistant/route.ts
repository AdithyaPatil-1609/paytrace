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

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

// One model call at a time: a laptop GPU serves a queue better than a crowd.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>) {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export async function POST(request: NextRequest) {
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
      data = await demoCommitments();
    }
  } catch {
    return Response.json({ error: "Payment data is unavailable right now." }, { status: 503, headers });
  }

  const reply = await inTurn(() => ask(message, data.items, data.asOf));
  return Response.json(reply, { headers });
}
