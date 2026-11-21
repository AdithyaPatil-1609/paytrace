import { cookies } from "next/headers";
import { AccountLogin } from "@/components/account-login";
import { accountForSession } from "@/db/neo4j/accounts";
import { accountConfigured, SESSION } from "@/lib/accounts/security";
import { AccountDashboard } from "@/components/account-dashboard";
import { noticeIsError, noticeText } from "@/lib/accounts/notices";
import { redirect } from "next/navigation";
import "./account.css";
import "./login.css";

export const metadata = { title: "Your account · Paytrace", robots: { index: false, follow: false } };
export const dynamic="force-dynamic";
export default async function AccountPage({searchParams}:{searchParams:Promise<{notice?:string}>}) {
  const configured=accountConfigured();
  const notice=(await searchParams).notice??"";
  const raw=(await cookies()).get(SESSION)?.value;
  let account=null, unavailable=false;
  if (configured && raw) { try { account=await accountForSession(raw); } catch { unavailable=true; } }
  const text=noticeText(notice);
  if(account) return <AccountDashboard name={account.name} email={account.email} linked={account.linked} lastSync={account.lastSync} asOf={new Date().toISOString().slice(0,10)} notice={text} noticeIsError={noticeIsError(notice)}/>;

  // Unauthenticated users are redirected to the home page with the sign-in drawer opened.
  if(!unavailable) redirect(notice ? `/?signin=1&notice=${encodeURIComponent(notice)}` : raw ? "/?signin=1&notice=session-expired" : "/?signin=1");
  return <AccountLogin configured={configured} unavailable={unavailable} notice={text}/>;
}
