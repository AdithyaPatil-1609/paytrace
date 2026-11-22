/**
 * POST /api/sandbox/statement  {action: "sample"} | {action: "upload", name, csv} | {action: "clear"}
 * Puts a bank statement into the visitor's demo sandbox in place of the demo
 * person's: the generated sample, or their own CSV export. Memory only.
 */
import { cookies } from "next/headers";
import { after } from "next/server";
import { dropSandboxGraph, syncSandboxGraph } from "@/db/neo4j/sandbox-graph";
import { clearStatement, loadSampleStatement, loadUploadedStatement } from "@/lib/sandbox/statement";
import { SANDBOX_COOKIE, newSandboxId, sandboxCookieOptions, validSandboxId } from "@/lib/sandbox/session";
import { openSandbox } from "@/lib/sandbox/store";
import { STATEMENT_LIMITS } from "@/lib/statements/csv";
import { readJsonBody } from "@/lib/security/body";
import { forbidden, fromOurSite } from "@/lib/security/origin";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const hit = takeHit("sandbox-statement", clientKey(request), LIMITS.pairing);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  // The CSV travels as JSON text, so allow for quoting overhead on top of the file limit.
  const read = await readJsonBody(request, STATEMENT_LIMITS.maxBytes + 64 * 1024);
  if (!read.ok) return Response.json({ error: read.status === 413 ? `The file is larger than ${STATEMENT_LIMITS.maxBytes / 1024} KB.` : read.error }, { status: read.status, headers });
  const input = (read.value ?? {}) as Record<string, unknown>;

  const jar = await cookies();
  const existing = jar.get(SANDBOX_COOKIE)?.value;
  const id = validSandboxId(existing) ? existing : newSandboxId();
  const box = openSandbox(id);
  let entry;
  if (input.action === "sample") entry = loadSampleStatement(box);
  else if (input.action === "clear") entry = clearStatement(box);
  else if (input.action === "upload" && typeof input.csv === "string" && typeof input.name === "string") entry = loadUploadedStatement(box, input.name, input.csv);
  else return Response.json({ error: "Send action sample, clear, or upload with name and csv." }, { status: 400, headers });
  jar.set(SANDBOX_COOKIE, id, sandboxCookieOptions());
  // Write the visitor's own Neo4j copy after answering; a cleared statement leaves only typed messages.
  if (entry.accepted) runAfter(() => box.statement || box.events.length ? syncSandboxGraph(box) : dropSandboxGraph(box.id));
  return Response.json(entry, { headers });
}

function runAfter(work: () => Promise<unknown>) {
  try { after(work); } catch { void work().catch(() => undefined); }
}
