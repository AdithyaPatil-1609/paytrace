import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/db/neo4j/accounts";
import { accountConfig, cookieOptions, sameOrigin, SESSION } from "@/lib/accounts/security";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response("Forbidden",{status:403});
  try { await endSession(request.cookies.get(SESSION)?.value); } catch { return new Response("Sign-out unavailable; retry",{status:503}); }
  const response=NextResponse.redirect(`${accountConfig().origin}/account`,303);
  response.cookies.set(SESSION,"",cookieOptions(0)); return response;
}
