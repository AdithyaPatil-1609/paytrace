import { cookies } from "next/headers";
import Link from "next/link";
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
  return <main className="account-shell"><header className="account-header"><Link className="wordmark" href="/account"><span>p</span>paytrace</Link><div>YOUR PAYMENTS · YOUR PERMISSION</div><Link href="/?demo=1">Explore synthetic demo</Link></header>
    {Object.hasOwn(messages,notice)&&<div className="account-banner" role="status">{messages[notice]}</div>}
    {account?<AccountDashboard name={account.name} email={account.email} linked={account.linked} lastSync={account.lastSync}/>:<section className="account-welcome"><div><p className="account-eyebrow">PRIVATE FINANCIAL INSIGHTS</p><h1>A clearer view of recurring payments.</h1><p>Connect your own Gmail account to discover payment receipts, recurring charges and price-change notices. Your information stays separate from other Paytrace users.</p><ul><li>Google sign-in does not grant inbox access.</li><li>Gmail linking is optional, and read-only.</li><li>Disconnect at any time to stop future sync.</li></ul></div><div className="account-card"><p className="account-eyebrow">WELCOME TO PAYTRACE</p><h2>Sign in to your account</h2><p>Create your personal payment dashboard.</p>{configured&&!unavailable?<form action="/api/auth/google/start" method="post"><input type="hidden" name="mode" value="login"/><button className="account-button google-button" type="submit"><span>G</span> Continue with Google</button></form>:<p className="account-warning">{unavailable?"Neo4j unavailable. Start the database and reload.":"Web Google OAuth is not configured yet. Follow the account setup guide in the repository."}</p>}<Link className="account-demo-link" href="/?demo=1">Continue to synthetic demo instead</Link></div></section>}
  </main>;
}
