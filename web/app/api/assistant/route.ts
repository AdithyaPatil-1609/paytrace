/**
 * POST /api/assistant  { message, scope: "demo" | "account", useAura?: boolean }
 * One chat turn. The account scope reads the signed-in person's own payments;
 * the demo scope reads the same synthetic data as the public dashboard.
 * Personal answers run locally. Opted-in generic guidance can use Aura.
 */
import { NextRequest } from "next/server";
import { accountForSession } from "@/neo4j/accounts";
import { readLiveDashboard } from "@/neo4j/live";
import { sandboxProfile } from "@/neo4j/sandbox-graph";
import { SESSION } from "@/server/accounts/security";
import { ask, MAX_MESSAGE, parseRouted } from "@/ai/assistant/assistant";
import { askAuraGuidance } from "@/ai/assistant/aura";
import { watchItems, type WatchItem } from "@/ai/assistant/watchlist";
import { demoCommitments } from "@/server/data/load-demo";
import { detectCommitments } from "@/server/payments/engine";
import { sandboxView } from "@/server/sandbox/dataset";
import { SANDBOX_COOKIE, validSandboxId } from "@/server/sandbox/session";
import { getSandbox } from "@/server/sandbox/store";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";
import { forbidden, fromOurSite } from "@/server/security/origin";
import { readJsonBody } from "@/server/security/body";
import { BROWSER_BODY_LIMITS } from "@/server/payments/rules";

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
  if (!fromOurSite(request)) return forbidden();
  if (waiting >= MAX_WAITING) {
    return Response.json(
      { error: "Ask AI is busy answering other people. Try again in a minute." },
      { status: 503, headers: { ...headers, "Retry-After": "30" } }
    );
  }

  const read = await readJsonBody(request, BROWSER_BODY_LIMITS.assistantBytes);
  if (!read.ok) return Response.json({ error: read.status === 413 ? "Message too large." : "Send JSON with a message." }, { status: read.status, headers });
  if (!read.value || typeof read.value !== "object") return Response.json({ error: "Send JSON with a message." }, { status: 400, headers });
  const body = read.value as { message?: unknown; scope?: unknown; context?: unknown; useAura?: unknown };
  // The previous answer's subject, echoed back by the panel. Checked like a model reply.
  const context = body.context && typeof body.context === "object" ? parseRouted(JSON.stringify(body.context)) : null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type a question first." }, { status: 400, headers });
  if (message.length > MAX_MESSAGE) {
    return Response.json({ error: `Keep it under ${MAX_MESSAGE} characters.` }, { status: 400, headers });
  }

  let data: { items: Awaited<ReturnType<typeof demoCommitments>>["items"]; asOf: string; watch?: WatchItem[] };
  try {
    if (body.scope === "account") {
      const user = await accountForSession(request.cookies.get(SESSION)?.value);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
      const { summary } = await readLiveDashboard(user.profile);
      // Everything the dashboard shows: repeating payments, and subscriptions seen only in emails.
      const watch = watchItems({ renewals: summary.subscriptionRenewals, scheduled: summary.scheduledDebits, registrations: summary.subscriptionRegistrations, candidates: summary.subscriptionCandidates }, summary.commitments);
      data = { items: summary.commitments, asOf: summary.asOf, watch };
    } else {
      // A demo visitor who loaded a sample statement or sent messages gets answers about that data.
      const id = request.cookies.get(SANDBOX_COOKIE)?.value;
      const box = validSandboxId(id) ? getSandbox(id) : null;
      if (box?.graph === "ready") {
        // The visitor's own Neo4j graph: Ask AI answers from it the same way as for a signed-in person.
        const { summary } = await readLiveDashboard(sandboxProfile(box.id));
        data = { items: summary.commitments, asOf: summary.asOf };
      } else if (box && (box.statement || box.events.length)) {
        const view = sandboxView(box);
        data = { items: detectCommitments(view.dataset), asOf: view.asOf };
      } else {
        data = await demoCommitments(body.scope === "demo-static");
      }
    }
  } catch {
    return Response.json({ error: "Payment data is unavailable right now." }, { status: 503, headers });
  }

  const reply = await inTurn(async () => {
    if (body.scope === "account" && body.useAura === true) {
      const guidance = await askAuraGuidance(message);
      if (guidance) return guidance;
    }
    return ask(message, data.items, data.asOf, { watch: data.watch, context, demo: body.scope !== "account" });
  });
  return Response.json(reply, { headers });
}
