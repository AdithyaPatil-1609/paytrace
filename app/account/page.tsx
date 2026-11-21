import { cookies } from "next/headers";
import { AuthWelcome } from "@/components/marketing/auth-welcome";
import { accountForSession } from "@/db/neo4j/accounts";
import { accountConfigured, SESSION } from "@/lib/accounts/security";
import { AccountDashboard } from "@/components/account-dashboard";
import "./account.css";

export const dynamic="force-dynamic";
export default async function AccountPage({searchParams}:{searchParams:Promise<{notice?:string}>}) {
  const configured=accountConfigured();
  const notice=(await searchParams).notice??"";
  const raw=(await cookies()).get(SESSION)?.value;
  let account=null, unavailable=false;
  if (configured && raw) { try { account=await accountForSession(raw); } catch { unavailable=true; } }
  const messages:Record<string,string>={"signed-in":"You're signed in. Gmail linking is optional.",linked:"Gmail permission granted. Your first sync is starting.",declined:"Permission was not granted. You can continue without Gmail.","wrong-account":"Please connect the same Google account you signed in with.","authorization-error":"Authorization was not completed. Please retry with the correct account and permissions.","permission-required":"Gmail read permission and offline access are required to sync.",disconnected:"Gmail disconnected. No new messages will be fetched. Previously imported payments remain.","disconnected-local":"Sync stopped locally. You can also revoke Paytrace access in your Google account settings.","session-expired":"Your session expired. Please sign in again."};
  if(account) return <AccountDashboard name={account.name} email={account.email} linked={account.linked} lastSync={account.lastSync} asOf={new Date().toISOString().slice(0,10)} notice={Object.hasOwn(messages,notice)?messages[notice]:undefined}/>;
  return <AuthWelcome configured={configured} unavailable={unavailable} notice={Object.hasOwn(messages,notice)?messages[notice]:undefined}/>;
}
