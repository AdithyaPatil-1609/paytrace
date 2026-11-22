import { NextRequest } from "next/server";
import { accountForSession } from "@/neo4j/accounts";
import { sameOrigin, SESSION } from "@/server/accounts/security";
import { syncAccount } from "@/server/accounts/sync";
import { gmailHistoryDays } from "@/server/accounts/gmail-history";
import { AccountError, accountErrors, type AccountErrorCode } from "@/server/accounts/errors";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export async function POST(request:NextRequest) {
  const headers={"Cache-Control":"no-store"};
  const fail=(code:AccountErrorCode,status=503)=>Response.json({error:accountErrors[code],code},{status,headers});
  // Cheap checks first (plan S2): limit per address, no body expected, same origin, then the session.
  const byAddress=takeHit("gmail-sync",clientKey(request),LIMITS.gmailSync);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);
  if (Number(request.headers.get("content-length")??0)>1024) return Response.json({error:"Request too large"},{status:413,headers});
  if (!sameOrigin(request)) return fail("origin-mismatch",403);
  try {
    const user=await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({error:"Unauthorized"},{status:401,headers});
    // Per account too, so one person cannot use up the shared Gmail quota from several addresses.
    const byAccount=takeHit("gmail-sync-account",user.sub,LIMITS.gmailSync);
    if (!byAccount.ok) return tooMany(byAccount.retryAfter);
    if (!user.linked) return fail("gmail-disconnected",409);
    return Response.json(await syncAccount(user.sub,request.nextUrl.searchParams.get("history")==="1",gmailHistoryDays(request.nextUrl.searchParams.get("days"))),{headers});
  } catch(error) {
    const code=error instanceof AccountError?error.code:"neo4j-unavailable";
    console.warn(`Gmail sync failed [${code}]`);
    return fail(code);
  }
}
