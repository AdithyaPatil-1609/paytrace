import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { SESSION } from "@/lib/accounts/security";
import { readLiveDashboard } from "@/db/neo4j/live";

export async function GET(request: NextRequest) {
  const headers={"Cache-Control":"no-store"};
  try {
    const user=await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({error:"Unauthorized"},{status:401,headers});
    const data=await readLiveDashboard(user.profile);
    return Response.json({linked:user.linked,lastSync:user.lastSync,syncStatus:user.syncStatus,...data},{headers});
  } catch { return Response.json({error:"Account data unavailable"},{status:503,headers}); }
}
