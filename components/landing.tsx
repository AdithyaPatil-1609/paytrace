/**
 * The public landing page: the PayTrace logo, a short brief on the product,
 * and two ways in: "Sign in / Sign up" (the authentication page) or the demo.
 */
import { PayTraceLogo } from "@/components/paytrace-logo";
import Link from "next/link";

/** Adhyay's authentication page. Change only this if its route moves. */
const AUTH_PATH = "/signin";
const DEMO_PATH = "/demo";

const finds = [
  "Price hikes on plans you already pay for",
  "Subscriptions you no longer use",
  "Debits due in the next few days",
  "Charges that continue after you cancel"
];

const steps = [
  { title: "Connect", text: "Sign in with Google. Link Gmail (read-only) and the PayTrace phone app, or import a bank statement (PDF or CSV). Each one is your choice." },
  { title: "Read", text: "An AI model running on our own machine reads each bank SMS and payment email, and every value is checked against the original text." },
  { title: "Act", text: "See every auto debit in one place, with the evidence behind each warning and the right way to stop it." }
];

export function Landing() {
  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/" aria-label="PayTrace home"><PayTraceLogo /></Link>
      <div>PAYMENTS · INSIGHTS · CONTROL</div>
      <Link href={AUTH_PATH}>Sign in / Sign up →</Link>
    </header>
    <section className="account-welcome">
      <div className="login-intro">
        <div className="landing-logo"><PayTraceLogo large /></div>
        <p className="account-eyebrow">THE AUTO DEBITS NOBODY CAN FIND</p>
        <h1>Find every recurring payment, and stop the ones you don&apos;t want.</h1>
        <p>PayTrace reads your bank SMS, payment emails and bank statements, and builds one clear picture of UPI AutoPay, card mandates, eNACH and app-store plans, explained in plain words.</p>
        <ul className="landing-finds">
          {finds.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="landing-actions">
          <Link className="account-button primary" href={AUTH_PATH}>Sign in / Sign up</Link>
          <Link className="account-button demo-button" href={DEMO_PATH}>Try the demo <span aria-hidden="true">→</span></Link>
        </div>
        <p className="login-footnote landing-note">The demo needs no account. It runs on sample data, and you can load a sample bank statement or send your own test SMS and emails.</p>
      </div>
      <div className="login-options">
        <p className="account-eyebrow">HOW IT WORKS</p>
        <div className="login-proof">
          {steps.map((step, i) => <FragmentStep key={step.title} n={i + 1} {...step} />)}
        </div>
        <article className="account-card login-choice demo-choice">
          <p className="account-eyebrow">YOUR DATA, YOUR PERMISSION</p>
          <h3>Private by design</h3>
          <p>Read-only Gmail. One-time passwords never leave your phone. Your data is kept apart from everyone else&apos;s and can be deleted at any time.</p>
          <Link className="landing-link" href="/privacy">How we protect your data →</Link>
        </article>
      </div>
    </section>
  </main>;
}

function FragmentStep({ n, title, text }: { n: number; title: string; text: string }) {
  return <>
    <span>{String(n).padStart(2, "0")}</span>
    <div><strong>{title}</strong><p>{text}</p></div>
  </>;
}
