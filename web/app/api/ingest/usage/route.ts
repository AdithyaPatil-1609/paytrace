/**
 * POST /api/ingest/usage: app usage from a paired Android phone (card M3).
 * Body: {windowStart, apps: [{package, merchant, lastUsed, minutes30d}]}, only
 * for apps the phone already knows are paid subscriptions. Signed with the
 * phone's key over "PAYTRACE-USAGE-v1\n..." (never the old shared code), so
 * the facts land on the phone owner's own subscriptions.
 */
import { z } from "zod";
import { recordAppUsage } from "@/neo4j/app-usage";
import { deviceById, markDeviceSeen } from "@/neo4j/devices";
import { identifySignedDevice } from "@/server/ingestion/device-auth";
import { APP_USAGE_LIMITS } from "@/server/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

const headers = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => {
  console.info(`ingest/usage: refused ${status} (${error})`);
  return Response.json({ ok: false, error }, { status, headers });
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)));
const Body = z.object({
  windowStart: day,
  apps: z.array(z.object({
    package: z.string().max(120).regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/),
    merchant: z.string().max(60).regex(/^[A-Za-z0-9][A-Za-z0-9 .&+'-]{1,59}$/),
    lastUsed: day.nullable(),
    minutes30d: z.number().int().min(0).max(APP_USAGE_LIMITS.maxMinutes)
  }).strict()).max(APP_USAGE_LIMITS.maxApps)
}).strict();

export function GET() {
  return Response.json({ ok: false, error: "This address only accepts app-usage reports from the Paytrace phone app (POST)." }, { status: 405, headers: { Allow: "POST", ...headers } });
}

export async function POST(request: Request) {
  const byAddress = takeHit("ingest-usage", clientKey(request), LIMITS.sms);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);
  if (Number(request.headers.get("content-length") ?? 0) > APP_USAGE_LIMITS.maxBodyBytes) return fail(413, "Report too large");

  const sender = await identifySignedDevice(request, deviceById, { purpose: "USAGE", maxBodyBytes: APP_USAGE_LIMITS.maxBodyBytes, bucket: "usage-device" });
  if (!sender.ok) return sender.status === 429 ? tooMany(sender.retryAfter ?? 60) : fail(sender.status, sender.error);
  if (!sender.profile || !sender.deviceId) return fail(401, "Unknown device");

  let parsed;
  try { parsed = Body.safeParse(JSON.parse(sender.raw)); } catch { return fail(400, "Send valid JSON"); }
  if (!parsed.success) return fail(400, "Invalid report");
  const { windowStart, apps } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const earliest = new Date(Date.now() - (APP_USAGE_LIMITS.windowDays + 2) * 86_400_000).toISOString().slice(0, 10);
  if (windowStart < earliest || windowStart > today) return fail(400, "Invalid report window");
  if (apps.some(app => app.lastUsed !== null && (app.lastUsed > tomorrow || app.lastUsed < windowStart))) return fail(400, "Invalid last-opened date");

  try {
    const result = await recordAppUsage(sender.profile, apps, windowStart, today);
    void markDeviceSeen(sender.deviceId).catch(() => undefined);
    return Response.json({ ok: true, apps: apps.length, matched: result.matched, merchants: result.merchants }, { headers });
  } catch {
    return fail(503, "Storage unavailable; retry");
  }
}
