import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { sameOrigin, SESSION } from "@/lib/accounts/security";
import { syncAccount } from "@/lib/accounts/sync";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export async function POST(request:NextRequest) {
  const hit = takeHit("gmail-sync", clientKey(request), LIMITS.gmailSync);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const headers={"Cache-Control":"no-store"};
  if (!sameOrigin(request)) return Response.json({error:"Forbidden"},{status:403,headers});
  try {
    const user=await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({error:"Unauthorized"},{status:401,headers});
    if (!user.linked) return Response.json({error:"Connect Gmail first"},{status:409,headers});
    return Response.json(await syncAccount(user.sub),{headers});
  } catch { return Response.json({error:"Gmail sync unavailable; retry or reconnect"},{status:503,headers}); }
}
