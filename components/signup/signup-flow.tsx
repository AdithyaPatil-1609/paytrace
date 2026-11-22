"use client";
/**
 * The sign-up steps. Each answer is saved on the server first, then the page
 * re-reads the account (router.refresh), so the screen always matches what
 * is stored.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayTraceLogo } from "@/components/paytrace-logo";
import { PhonePairing } from "@/components/account/phone-pairing";
import { PhoneOtp, type FirebaseWebConfig } from "./phone-otp";
import { StatementImport } from "@/components/account/statement-import";
import { SyncProgress } from "./sync-progress";

export type SignUpAccount = {
  name: string; email: string; linked: boolean; gmailEmail: string | null;
  phoneLast4: string | null; phoneStep: "verified" | "skipped" | null; smsConsent: "yes" | "no" | null; syncStatus: string | null;
};

type Props = {
  account: SignUpAccount | null; configured: boolean; firebase: FirebaseWebConfig | null; origin: string;
  gmailConsentVersion: string; smsConsentText: string; notice?: string; noticeIsError?: boolean;
};

export async function saveStep(body: Record<string, unknown>): Promise<string | null> {
  try {
    const response = await fetch("/api/account/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) { window.location.assign("/signup?notice=session-expired"); return "Signed out"; }
    const answer = await response.json().catch(() => ({}));
    return response.ok ? null : typeof answer.error === "string" ? answer.error : "Something went wrong. Please retry.";
  } catch { return "No connection. Please retry."; }
}

const STEPS = [
  { label: "Account", text: "Your name, then Google. No password to remember." },
  { label: "Phone", text: "Optional. A 6-digit SMS code proves the number is yours." },
  { label: "Permissions", text: "Gmail, read-only. Bank SMS or a statement if you like." },
  { label: "Sync", text: "Watch Paytrace find your recurring payments." }
];

/** An illustration with made-up merchants, so a first-time visitor sees what they get. */
const EXAMPLE = [
  { name: "Streaming app", detail: "Price up from ₹499 to ₹649", amount: "₹649/mo", tone: "warn" },
  { name: "Gym membership", detail: "Not used in 3 months", amount: "₹1,500/mo", tone: "idle" },
  { name: "Insurance eNACH", detail: "Next debit on the 5th", amount: "₹2,140/mo", tone: "ok" }
];

export function SignUpFlow(props: Props & { initialTab?: "signup" | "signin" }) {
  const { account } = props;
  const [continued, setContinued] = useState(account?.syncStatus === "syncing");
  const [imported, setImported] = useState(false);
  const step = !account ? 0 : !account.phoneStep ? 1 : continued && account.linked && account.smsConsent ? 3 : 2;

  return <main className="account-shell login-ledger signup-shell">
    <header className="account-header">
      <Link className="wordmark" href="/"><PayTraceLogo /></Link>
      <div>PAYMENTS · INSIGHTS · CONTROL</div>
      <span aria-hidden="true" />
    </header>
    <section className="signup-layout">
      <aside className="signup-aside">
        <p className="account-eyebrow">THE AUTO DEBITS NOBODY CAN FIND</p>
        <h1 className="signup-headline">Every recurring payment, found in minutes.</h1>
        <p className="signup-lede">UPI AutoPay, card mandates, eNACH and app-store plans in one place, with the proof behind every warning and the right way to stop each one.</p>
        <div className="signup-preview" aria-label="Example of what Paytrace shows">
          <div className="signup-preview-head"><span>What you&apos;ll see</span><em>Example</em></div>
          {EXAMPLE.map(item => <div key={item.name} className={`signup-preview-row ${item.tone}`}>
            <i aria-hidden="true" />
            <div><strong>{item.name}</strong><small>{item.detail}</small></div>
            <b>{item.amount}</b>
          </div>)}
          <div className="signup-preview-foot">3 recurring payments · ₹4,289 a month</div>
        </div>
        <ol className="signup-timeline">
          {STEPS.map((s, i) => <li key={s.label} className={i < step ? "done" : i === step ? "current" : ""}>
            <span aria-hidden="true">{i < step ? "✓" : i + 1}</span>
            <div><strong>{s.label}</strong><small>{s.text}</small></div>
          </li>)}
        </ol>
        <ul className="signup-trust">
          <li><b>Read-only</b> Gmail access</li>
          <li><b>OTPs</b> never leave your phone</li>
          <li><b>Delete</b> everything any time</li>
          <li><b>DPDP</b> consent recorded</li>
        </ul>
      </aside>
      <div className="signup-main">
        {account && <ol className="signup-steps" aria-label="Sign-up steps">
          {STEPS.map((s, i) => <li key={s.label} className={i < step ? "done" : i === step ? "current" : ""} aria-current={i === step ? "step" : undefined}><span>{i < step ? "✓" : i + 1}</span>{s.label}</li>)}
        </ol>}
        {props.notice && <div className={props.noticeIsError ? "account-banner account-banner-error" : "account-banner"} role={props.noticeIsError ? "alert" : "status"}>{props.notice}</div>}
        {step === 0 && <StartStep configured={props.configured} initialTab={props.initialTab ?? "signup"} />}
        {step === 1 && account && <PhoneStep firebase={props.firebase} />}
        {step === 2 && account && <PermissionsStep {...props} account={account} onImported={() => setImported(true)} onContinue={() => setContinued(true)} />}
        {step === 3 && account && <SyncProgress account={account} imported={imported} />}
      </div>
    </section>
  </main>;
}

function StartStep({ configured, initialTab }: { configured: boolean; initialTab: "signup" | "signin" }) {
  const [tab, setTab] = useState(initialTab);
  return <article className="account-card signup-card signup-start">
    <div className="signup-tabs" role="tablist" aria-label="Sign up or sign in">
      <button role="tab" type="button" aria-selected={tab === "signup"} className={tab === "signup" ? "active" : ""} onClick={() => setTab("signup")}>Sign up</button>
      <button role="tab" type="button" aria-selected={tab === "signin"} className={tab === "signin" ? "active" : ""} onClick={() => setTab("signin")}>Sign in</button>
    </div>
    {tab === "signup"
      ? <>
          <h2>Create your Paytrace account</h2>
          <p>Takes about two minutes. You sign up with Google, so there is no password to remember.</p>
          {configured
            ? <form action="/api/auth/google/start" method="post" className="signup-form">
                <input type="hidden" name="mode" value="login" />
                <input type="hidden" name="next" value="signup" />
                <label className="signup-field">Full name
                  <input name="fullName" required minLength={2} maxLength={80} autoComplete="name" placeholder="As you want it shown" />
                </label>
                <button className="account-button primary google-button" type="submit"><span aria-hidden="true">G</span> Sign up with Google</button>
              </form>
            : <p className="account-warning">Sign-up is not available on this server right now. You can still explore the demo.</p>}
        </>
      : <>
          <h2>Welcome back</h2>
          <p>Sign in with the Google account you used to sign up.</p>
          {configured
            ? <form action="/api/auth/google/start" method="post" className="signup-form">
                <input type="hidden" name="mode" value="login" />
                <button className="account-button primary google-button" type="submit"><span aria-hidden="true">G</span> Continue with Google</button>
              </form>
            : <p className="account-warning">Google sign-in is not configured on this server. You can still explore the demo.</p>}
        </>}
    <p className="signin-limit"><strong>Approved test accounts only.</strong> Until Google completes its security review, only Google accounts we have approved can sign up or sign in. Evaluators: please use the demo.</p>
    <Link className="account-button demo-button" href="/demo">Try the demo instead <span aria-hidden="true">→</span></Link>
    <p className="login-footnote">By continuing you agree to our <Link href="/privacy">privacy notice</Link>. <Link href="/">Back to home</Link></p>
  </article>;
}

function PhoneStep({ firebase }: { firebase: FirebaseWebConfig | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function skip() {
    setBusy(true); setError("");
    const problem = await saveStep({ action: "phone-skip" });
    setBusy(false);
    if (problem) setError(problem); else router.refresh();
  }
  return <article className="account-card signup-card">
    <p className="account-eyebrow">STEP 2 · PHONE NUMBER (OPTIONAL)</p>
    <h2>Add your mobile number</h2>
    <p>We send a 6-digit code by SMS to check the number is yours. Paytrace keeps it encrypted and shows only the last 4 digits.</p>
    {firebase ? <PhoneOtp config={firebase} onVerified={() => router.refresh()} /> : <p className="account-warning">Phone verification is not set up on this server yet. You can skip this step.</p>}
    {error && <p className="account-warning" role="alert">{error}</p>}
    <button className="account-button demo-button" type="button" onClick={skip} disabled={busy}>Skip, I don&apos;t want to add my number</button>
  </article>;
}

function PermissionsStep({ account, origin, gmailConsentVersion, smsConsentText, onImported, onContinue }: Props & { account: SignUpAccount; onImported: () => void; onContinue: () => void }) {
  const router = useRouter();
  const [gmailChoice, setGmailChoice] = useState<"ask" | "own" | "other">("ask");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function answerSms(answer: "yes" | "no") {
    setBusy(true); setError("");
    const problem = await saveStep({ action: "sms", answer });
    setBusy(false);
    if (problem) setError(problem); else router.refresh();
  }
  const ready = account.linked && account.smsConsent !== null;

  return <>
    <article className="account-card signup-card">
      <p className="account-eyebrow">STEP 3 · PERMISSIONS</p>
      <h2>Where should Paytrace look for your payments?</h2>
      <p>You decide. Gmail is needed (read-only). Bank SMS from your phone is optional.</p>
      {account.phoneStep === "verified" && <p className="account-note">✓ Phone number verified (ending {account.phoneLast4}).</p>}
    </article>

    <article className="account-card signup-card">
      <p className="account-eyebrow">A · GMAIL (REQUIRED, READ-ONLY)</p>
      {account.linked
        ? <>
            <p className="signup-ok">✓ Gmail connected: <strong>{account.gmailEmail}</strong></p>
            <details className="signup-more"><summary>Use a different Gmail instead</summary><GmailForm other consentVersion={gmailConsentVersion} label="Choose another Gmail" /></details>
          </>
        : <>
            <h3>Read payment emails from {account.email}?</h3>
            <ul className="signup-points">
              <li>Read-only: Paytrace cannot send, change or delete any email.</li>
              <li>Only payment emails: receipts, renewals, price changes, mandates, trials. Emails with an OTP, PIN or password are skipped.</li>
              <li>Only the payment details are kept (merchant, amount, date, reference), never the email text.</li>
              <li>Disconnect at any time from Sync Gmail at the top of your dashboard. <Link href="/privacy">Full privacy notice</Link></li>
            </ul>
            {gmailChoice === "ask" && <div className="signup-choice">
              <button className="account-button primary" type="button" onClick={() => setGmailChoice("own")}>Yes, use this Gmail</button>
              <button className="account-button demo-button" type="button" onClick={() => setGmailChoice("other")}>No</button>
            </div>}
            {gmailChoice === "own" && <GmailForm consentVersion={gmailConsentVersion} label={`Connect ${account.email}`} />}
            {gmailChoice === "other" && <>
              <p className="account-note">No problem. Paytrace needs <strong>one</strong> Gmail to find your payments, so you can add a different Gmail account instead.</p>
              <GmailForm other consentVersion={gmailConsentVersion} label="Add another Gmail account" />
              <button className="signup-link" type="button" onClick={() => setGmailChoice("own")}>Use {account.email} after all</button>
            </>}
            <p className="signin-limit">While Google reviews Paytrace, the Gmail must be on our approved test list.</p>
          </>}
    </article>

    <article className="account-card signup-card">
      <p className="account-eyebrow">B · BANK SMS FROM YOUR PHONE (OPTIONAL)</p>
      <p>{smsConsentText}</p>
      <div className="signup-choice">
        <button className={`account-button ${account.smsConsent === "yes" ? "primary" : "demo-button"}`} type="button" onClick={() => answerSms("yes")} disabled={busy} aria-pressed={account.smsConsent === "yes"}>Yes, allow bank SMS</button>
        <button className={`account-button ${account.smsConsent === "no" ? "primary" : "demo-button"}`} type="button" onClick={() => answerSms("no")} disabled={busy} aria-pressed={account.smsConsent === "no"}>No</button>
      </div>
      {account.smsConsent === "yes" && <div className="signup-pair">
        <p className="account-note">Install the Paytrace Android app, open it, and enter the server <strong>{origin || "this site's address"}</strong> with the code below (or pair later from Add phone at the top of your dashboard).</p>
        <PhonePairing />
      </div>}
      {account.smsConsent === "no" && <div className="signup-pair">
        <p className="account-note">Fine. Paytrace will use Gmail. You can also upload a bank statement CSV, so payments that only show up at the bank are found too.</p>
        <StatementImport onImported={onImported} />
      </div>}
      {account.smsConsent === "yes" && <details className="signup-more"><summary>Also upload a bank statement CSV</summary><StatementImport onImported={onImported} /></details>}
    </article>

    {error && <p className="account-warning" role="alert">{error}</p>}
    <button className="account-button primary signup-continue" type="button" disabled={!ready} onClick={onContinue}>
      {ready ? "Continue: sync my payments →" : !account.linked ? "Connect a Gmail to continue" : "Answer the SMS question to continue"}
    </button>
  </>;
}

/** Posts to the Google flow with the Gmail consent; "other" lets the person pick any Google account. */
function GmailForm({ other = false, consentVersion, label }: { other?: boolean; consentVersion: string; label: string }) {
  return <form action="/api/auth/google/start" method="post" className="signup-form">
    <input type="hidden" name="mode" value="link" />
    <input type="hidden" name="next" value="signup" />
    <input type="hidden" name="consent" value={consentVersion} />
    {other && <input type="hidden" name="other" value="yes" />}
    <label className="consent-check"><input type="checkbox" name="agree" value="yes" required /> I agree that Paytrace may read my payment emails, read-only, for the purpose above.</label>
    <button className="account-button primary" type="submit">{label} →</button>
  </form>;
}
