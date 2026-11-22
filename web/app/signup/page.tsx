/**
 * /signup: create a Paytrace account in four steps.
 *   1. Full name, then Google sign-in (creates the account).
 *   2. Phone number, verified with an SMS code (optional).
 *   3. Permissions: bank SMS through the phone app (optional, or upload a
 *      bank statement CSV instead) and Gmail, read-only (required: the
 *      sign-in Gmail or another one).
 *   4. The first sync, with live progress.
 * The step shown comes from what the account already has, so a reload or a
 * return from Google lands on the right step.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SignUpFlow, type SignUpAccount } from "@/web/components/signup/signup-flow";
import { accountForSession } from "@/neo4j/accounts";
import { GMAIL_CONSENT_VERSION } from "@/server/accounts/consent";
import { noticeIsError, noticeText } from "@/server/accounts/notices";
import { accountConfigured, SESSION } from "@/server/accounts/security";
import { SMS_CONSENT_TEXT } from "@/server/accounts/sms-consent";
import "../account/account.css";
import "../account/login.css";
import "./signup.css";

export const metadata: Metadata = { title: "Create your account · Paytrace", alternates: { canonical: "/signup" } };
export const dynamic = "force-dynamic";

function firebaseConfig() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? ""
  };
  return Object.values(config).every(Boolean) ? config : null;
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = (await searchParams).notice ?? "";
  const raw = (await cookies()).get(SESSION)?.value;
  let account: SignUpAccount | null = null;
  let unavailable = false;
  if (raw) {
    try {
      const a = await accountForSession(raw);
      if (a) {
        if (a.signupDone && !notice) redirect("/account");
        account = { name: a.name, email: a.email, linked: a.linked, gmailEmail: a.gmailEmail, phoneLast4: a.phoneLast4, phoneStep: a.phoneStep, smsConsent: a.smsConsent, syncStatus: a.syncStatus };
      }
    } catch (error) {
      // redirect() works by throwing; let it through.
      if (error && typeof error === "object" && "digest" in error) throw error;
      unavailable = true;
    }
  }
  return <SignUpFlow
    account={account}
    configured={accountConfigured() && !unavailable}
    firebase={firebaseConfig()}
    origin={process.env.PAYTRACE_APP_URL?.replace(/\/$/, "") ?? ""}
    gmailConsentVersion={GMAIL_CONSENT_VERSION}
    smsConsentText={SMS_CONSENT_TEXT}
    notice={noticeText(notice) ?? (unavailable ? "Account storage is unavailable. Please try again in a minute." : undefined)}
    noticeIsError={noticeIsError(notice) || unavailable}
  />;
}
