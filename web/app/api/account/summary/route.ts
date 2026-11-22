import { after, NextRequest, NextResponse } from "next/server";
import { accountForSession, rotateSession } from "@/neo4j/accounts";
import { cookieOptions, SESSION } from "@/server/accounts/security";
import { readLiveDashboard } from "@/neo4j/live";
import { refreshRecurringChecks } from "@/neo4j/recurring-checks";
import { refreshMerchantIdentities } from "@/neo4j/merchant-identities";

export async function GET(request: NextRequest) {
  const headers={"Cache-Control":"no-store"};
  try {
    const raw=request.cookies.get(SESSION)?.value;
    // The open account page refreshes every 10 seconds; those background reads must not keep an idle session alive.
    const background=new URL(request.url).searchParams.get("background")==="1";
    const user=await accountForSession(raw,!background);
    if (!user) return Response.json({error:"Unauthorized"},{status:401,headers});
    const data=await readLiveDashboard(user.profile);
    // New repeating groups are checked by the local model after this answer is sent; the next refresh shows the result.
    if (data.summary.recurringChecksPending>0) after(()=>refreshRecurringChecks(user.profile).catch(()=>undefined));
    if (data.summary.merchantIdentityPending.length) after(()=>refreshMerchantIdentities(user.profile, data.summary.merchantIdentityPending).catch(()=>undefined));
    const response=NextResponse.json({linked:user.linked,lastSync:user.lastSync,syncStatus:user.syncStatus,syncError:user.syncError,iphone:user.iphone,...data},{headers});
    // The dashboard calls this route regularly, so it is where an old session token is swapped for a fresh one.
    const rotated=await rotateSession(raw).catch(()=>null);
    if (rotated) response.cookies.set(SESSION,rotated.raw,cookieOptions(Math.max(60,Math.floor((Date.parse(rotated.expires)-Date.now())/1000))));
    return response;
  } catch { return Response.json({error:"Account data unavailable"},{status:503,headers}); }
}
