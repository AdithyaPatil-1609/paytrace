/**
 * POST /api/account/statement  {name, csv}
 * Imports a bank statement CSV into the signed-in person's own data. The file
 * is read in memory; only the debit lines' date, amount and description are
 * kept, with account numbers removed. The answer comes at once; the lines are
 * stored in the background and appear on the dashboard as they arrive.
 */
import { after, type NextRequest } from "next/server";
import { ingestLiveEvent } from "@/db/neo4j/live";
import { statementProvenance } from "@/lib/ingestion/trust";
import { requireUser } from "@/lib/accounts/require-user";
import { parseStatementCsv, STATEMENT_LIMITS } from "@/lib/statements/csv";
import { statementEvents } from "@/lib/statements/events";
import { readJsonBody } from "@/lib/security/body";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const headers = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers });

export async function POST(request: NextRequest) {
  const hit = takeHit("statement-import", clientKey(request), LIMITS.pairing);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;

  const read = await readJsonBody(request, STATEMENT_LIMITS.maxBytes + 64 * 1024);
  if (!read.ok) return fail(read.status, read.status === 413 ? `The file is larger than ${STATEMENT_LIMITS.maxBytes / 1024} KB. Export a shorter period, such as 12 months.` : read.error);
  const csv = (read.value as { csv?: unknown } | null)?.csv;
  if (typeof csv !== "string") return fail(400, "Send the statement as CSV text.");

  const parsed = parseStatementCsv(csv);
  if (!parsed.ok) return fail(400, parsed.error);
  const { events, skipped } = statementEvents(parsed.lines);
  if (!events.length) return fail(400, "The statement has no debit lines to import.");

  const profile = signedIn.user.profile;
  const provenance = statementProvenance();
  const store = async () => {
    for (const event of events) {
      try { await ingestLiveEvent(profile, event, undefined, provenance); } catch { /* one bad line must not stop the rest; never log its contents */ }
    }
  };
  try { after(store); } catch { void store(); }

  return Response.json({
    ok: true,
    lines: parsed.lines.length,
    debits: events.length,
    skipped: parsed.skipped + skipped,
    from: parsed.lines[0].date,
    to: parsed.lines.at(-1)!.date
  }, { status: 202, headers });
}
