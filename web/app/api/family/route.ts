/** GET /api/family: who can see my payments, my open invite links, and whose payments I can see. */
import type { NextRequest } from "next/server";
import { readFamily } from "@/neo4j/family";
import { familyRequest, json } from "@/server/accounts/family-route";

export async function GET(request: NextRequest) {
  const req = await familyRequest(request, "list", null);
  if (!req.ok) return req.response;
  try { return json(await readFamily(req.user.sub)); } catch { return json({ error: "Family access unavailable; retry" }, 503); }
}
