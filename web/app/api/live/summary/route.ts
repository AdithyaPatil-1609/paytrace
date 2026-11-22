import { authorized, liveProfile } from "@/server/ingestion/auth";
import { readLiveSummary } from "@/neo4j/live";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorized(request, "x-paytrace-read", process.env.PAYTRACE_READ_CODE)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const profile = liveProfile();
  if (!profile) return Response.json({ error: "Live storage is disabled" }, { status: 503, headers });
  try { return Response.json(await readLiveSummary(profile), { headers }); }
  catch { return Response.json({ error: "Live storage unavailable" }, { status: 503, headers }); }
}
