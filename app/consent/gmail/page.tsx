/**
 * /consent/gmail: the consent screen shown before Paytrace may read Gmail.
 * States the purpose, exactly what is read and kept, where it goes, for how
 * long, and how to withdraw (DPDP Act 2023). Only a signed-in person sees it.
 */
import { PayTraceLogo } from "@/components/paytrace-logo";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountForSession } from "@/db/neo4j/accounts";
import { GMAIL_CONSENT_VERSION } from "@/lib/accounts/consent";
import { SESSION } from "@/lib/accounts/security";
import "../../account/account.css";
import "../../account/login.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Allow Gmail access · Paytrace", robots: { index: false, follow: false } };

const points: { title: string; text: string }[] = [
  { title: "Why", text: "Only to find your recurring payments (subscriptions, autopays, mandates, renewals), warn you about price rises, unused services and upcoming debits, and show how to stop them." },
  { title: "What Paytrace reads", text: "Read-only access to your Gmail. It looks only for payment emails: receipts, renewal notices, price changes, mandate and trial emails. It cannot send, change or delete any email." },
  { title: "What Paytrace keeps", text: "Only the payment details: merchant, amount, date, renewal date and reference. The email text itself is not stored and never written to logs. Emails with an OTP, PIN or password are skipped." },
  { title: "Where it goes", text: "Emails are read by an AI model running on Paytrace's own machine. Payment details are stored in Paytrace's database, kept apart from everyone else's. Nothing is sold or used for advertising, and no cloud AI is used without asking you separately." },
  { title: "How long", text: "Until you disconnect Gmail or delete your data. Your Gmail access key is stored encrypted." },
  { title: "How to stop", text: "Disconnect Gmail under Sync Gmail at the top of your dashboard at any time: Paytrace revokes its access at Google and stops reading. Delete my data removes everything Paytrace holds about you." }
];

export default async function GmailConsentPage() {
  const raw = (await cookies()).get(SESSION)?.value;
  let signedIn = false;
  try { signedIn = Boolean(raw && await accountForSession(raw)); } catch { signedIn = false; }
  if (!signedIn) redirect("/signin");

  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/account"><PayTraceLogo /></Link>
      <div>YOUR CONSENT</div>
      <Link href="/account">Not now →</Link>
    </header>
    <section className="privacy-wrap">
      <p className="account-eyebrow">BEFORE WE READ ANYTHING</p>
      <h1>Allow Paytrace to read your payment emails?</h1>
      <p>Connecting Gmail is optional. Paytrace works without it, and you can withdraw this consent at any time.</p>
      <dl className="consent-points">
        {points.map(point => <div key={point.title}><dt>{point.title}</dt><dd>{point.text}</dd></div>)}
      </dl>
      <form action="/api/auth/google/start" method="post" className="consent-form">
        <input type="hidden" name="mode" value="link" />
        <input type="hidden" name="consent" value={GMAIL_CONSENT_VERSION} />
        <label className="consent-check"><input type="checkbox" name="agree" value="yes" required /> I agree that Paytrace may read my payment emails, read-only, for the purpose above.</label>
        <button className="account-button primary" type="submit">Continue to Google</button>
        <Link className="account-demo-link" href="/account">Not now</Link>
      </form>
      <p className="login-footnote">Google will ask you to confirm read-only access next. <Link href="/privacy">Full privacy policy</Link></p>
    </section>
  </main>;
}
