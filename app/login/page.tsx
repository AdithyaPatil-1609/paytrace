import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountForSession } from "@/db/neo4j/accounts";
import { accountConfigured, SESSION } from "@/lib/accounts/security";
import { AuthWelcome } from "@/components/marketing/auth-welcome";

export const metadata = {title:"Sign in | Paytrace"};
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const configured=accountConfigured();
  const raw=(await cookies()).get(SESSION)?.value;
  let account=null, unavailable=false;
  if(configured&&raw) {try {account=await accountForSession(raw);} catch {unavailable=true;}}
  if(account) redirect("/account");
  return <AuthWelcome configured={configured} unavailable={unavailable}/>;
}
