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
  "A higher charge: see the earlier payment and any notice behind it",
  "A subscription you may not use: check what you actually know",
  "An upcoming debit: see when it may reach your account",
  "A charge after cancellation: keep the timeline and proof together"
];

const steps = [
  { title: "Bring the clues together", text: "Choose what to connect: read-only Gmail, phone bank alerts or a bank statement. You decide what PayTrace can see." },
  { title: "Follow the money", text: "PayTrace links repeat charges, merchant names and notices in an evidence graph, so a warning has a reason you can inspect." },
  { title: "Know your next move", text: "Review what changed, see what may be due next and follow cancellation guidance. PayTrace never cancels a payment for you." }
];

export function Landing() {
  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/" aria-label="PayTrace home"><PayTraceLogo /></Link>
      <div>PAYMENTS · EVIDENCE · CONTROL</div>
      <Link href={AUTH_PATH}>Sign in / Sign up →</Link>
    </header>
    <section className="account-welcome">
      <div className="login-intro">
        <div className="landing-logo"><PayTraceLogo large /></div>
        <p className="account-eyebrow">THE CHARGE IS ONLY PART OF THE STORY</p>
        <h1>Your money leaves every month. Do you know why?</h1>
        <p>A free trial renews. A price rises. A cancelled plan charges again. The clues are scattered across bank alerts, emails and statements. PayTrace connects them, so you can see what happened and decide what to do next.</p>
        <ul className="landing-finds">
          {finds.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="landing-actions">
          <Link className="account-button primary" href={AUTH_PATH}>Sign in / Sign up</Link>
          <Link className="account-button demo-button" href={DEMO_PATH}>See how it works <span aria-hidden="true">→</span></Link>
        </div>
        <p className="login-footnote landing-note">Explore the interactive demo with sample payments. No account or bank connection is needed. Google sign-in is currently limited to approved test accounts.</p>
      </div>
      <div className="login-options">
        <p className="account-eyebrow">HOW IT WORKS</p>
        <div className="login-proof">
          {steps.map((step, i) => <FragmentStep key={step.title} n={i + 1} {...step} />)}
        </div>
        <article className="account-card login-choice demo-choice">
          <p className="account-eyebrow">YOUR DATA, YOUR PERMISSION</p>
          <h3>Your data stays your decision</h3>
          <p>PayTrace does not ask for your bank password. Gmail access is optional and read-only; your personal records are kept separate, and you can request deletion.</p>
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
