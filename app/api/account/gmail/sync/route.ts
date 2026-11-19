import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { sameOrigin, SESSION } from "@/lib/accounts/security";
import { syncAccount } from "@/lib/accounts/sync";
import { AccountError, accountErrors, type AccountErrorCode } from "@/lib/accounts/errors";

export async function POST(request:NextRequest) {
  const headers={"Cache-Control":"no-store"};
  const fail=(code:AccountErrorCode,status=503)=>Response.json({error:accountErrors[code],code},{status,headers});
  if (!sameOrigin(request)) return fail("origin-mismatch",403);
  try {
    const user=await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({error:"Unauthorized"},{status:401,headers});
    if (!user.linked) return fail("gmail-disconnected",409);
    return Response.json(await syncAccount(user.sub,request.nextUrl.searchParams.get("history")==="1"),{headers});
  } catch(error) {
    const code=error instanceof AccountError?error.code:"neo4j-unavailable";
    console.warn(`Gmail sync failed [${code}]`);
    return fail(code);
  }
}
