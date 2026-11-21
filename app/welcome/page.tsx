import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { accountForSession } from "@/db/neo4j/accounts";
import { accountConfigured, SESSION } from "@/lib/accounts/security";
import { MarketingHeader } from "@/components/marketing/landing";
import { AuthWelcome } from "@/components/marketing/auth-welcome";
import s from "@/components/marketing/marketing.module.css";

export const metadata={title:"Your account is verified | Paytrace"};
export const dynamic="force-dynamic";
export default async function WelcomePage() {
  if(!accountConfigured()) redirect("/login");
  const raw=(await cookies()).get(SESSION)?.value;
  if(!raw) redirect("/login");
  let account;
  try {account=await accountForSession(raw);} catch {return <AuthWelcome configured unavailable/>;}
  if(!account) redirect("/login");
  if(account.linked) redirect("/account");
  return <div className={s.site}><MarketingHeader/><main className={s.authLayout}><section className={s.authStory}><p className={s.verified}>✓ Google identity verified</p><h1>You’re in.<br /><em>Now, connect the dots.</em></h1><p className={s.lead}>Welcome, {account.name.split(" ")[0]}. Your personal workspace is ready. The next step is yours to choose.</p><ol className={s.authSteps}><li><strong>Identity verified</strong><span>{account.email}</span></li><li><strong>Connect Gmail, if you choose</strong><span>A separate Google permission screen explains access.</span></li><li><strong>See what repeats</strong><span>Supported financial messages become payment evidence.</span></li></ol></section><section className={s.authForm}><p className={s.eyebrow}>Optional connection</p><h2>Receipts scattered.<br />Evidence connected.</h2><p>Connect the same Gmail account to import supported payment receipts and notices into your dashboard.</p><ul className={s.permissionList}><li>Read-only access. No sending or deleting emails.</li><li>Disconnect to stop future syncs.</li><li>Previously imported records remain after disconnecting.</li></ul><form action="/api/auth/google/start" method="post"><input type="hidden" name="mode" value="link"/><button type="submit" className={s.primary}>Connect Gmail with permission</button></form><p className={s.permissionNote}>Google’s read permission covers your mailbox. Paytrace searches configured senders and financial subjects; not every receipt format is supported.</p><Link className={s.outline} href="/account">Skip for now · open my workspace</Link><p className={s.caption}>You can connect later from your account menu.</p></section></main></div>;
}
