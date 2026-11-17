import { authorized, liveProfile } from "@/lib/ingestion/auth";
import { validateEvent } from "@/lib/ingestion/event";
import { ingestLiveEvent } from "@/db/neo4j/live";

export async function POST(request: Request) {
  if (!authorized(request, "x-paytrace-device", process.env.PAYTRACE_DEVICE_CODE)) {
    return Response.json({ ok: false, error: "Unknown device" }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > 2000) {
    return Response.json({ ok: false, error: "Message too large" }, { status: 413 });
  }

  let event;
  try {
    event = validateEvent(JSON.parse(text));
    if (event.source !== "sms") throw new Error("Wrong source");
  } catch {
    return Response.json({ ok: false, error: "Invalid payment event" }, { status: 400 });
  }
  const profile = liveProfile();
  if (!profile) return Response.json({ ok: false, error: "Live storage is disabled" }, { status: 503 });
  try { return Response.json({ ok: true, ...await ingestLiveEvent(profile, event) }); }
  catch { return Response.json({ ok: false, error: "Live storage unavailable" }, { status: 503 }); }
}
