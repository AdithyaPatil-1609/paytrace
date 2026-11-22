import { hasDemoNeo4jConfig } from "@/neo4j/client";
import { challengeInNeo4j } from "@/neo4j/challenge";
import { ChallengeInputError, challengeActions, type ChallengeAction } from "@/server/scenarios/challenge";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";
import { forbidden, fromOurSite } from "@/server/security/origin";
import { readJsonBody } from "@/server/security/body";
import { BROWSER_BODY_LIMITS } from "@/server/payments/rules";

export async function POST(request: Request) {
  const hit = takeHit("challenge", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  const read = await readJsonBody(request, BROWSER_BODY_LIMITS.challengeBytes);
  if (!read.ok) return Response.json({ error: read.status === 413 ? "Request too large." : "Send a valid challenge request." }, { status: read.status });
  const body = read.value;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid challenge request." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.commitmentId !== "string" || input.commitmentId.length > 200 || !input.commitmentId ||
      typeof input.action !== "string" || !challengeActions.includes(input.action as ChallengeAction) ||
      (input.merchantName !== undefined && (typeof input.merchantName !== "string" || input.merchantName.length > 60))) {
    return Response.json({ error: "Choose a supported challenge and payment." }, { status: 400 });
  }
  if (!hasDemoNeo4jConfig()) return Response.json({ error: "Neo4j is not configured. Reload the offline demo to use local challenges." }, { status: 503 });
  try {
    return Response.json(await challengeInNeo4j({ commitmentId: input.commitmentId, action: input.action as ChallengeAction, merchantName: input.merchantName as string | undefined }));
  } catch (error) {
    if (error instanceof ChallengeInputError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The graph could not evaluate this challenge. Check the connection and choose a payment from the original dataset." }, { status: 503 });
  }
}
