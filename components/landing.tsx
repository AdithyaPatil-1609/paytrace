/**
 * The public landing page: what Paytrace does, how it works, and how data is
 * protected. Its only actions are "Sign in" and "Try the demo".
 */
import { PayTraceLogo } from "@/components/paytrace-logo";
import Link from "next/link";

const steps = [
  { title: "Connect", text: "Sign in with Google. Link Gmail (read-only) and the Paytrace phone app, only if you choose to." },
  { title: "Read", text: "An AI model running on our own machine reads each bank SMS and payment email, and every value is checked against the original text." },
  { title: "Act", text: "See price changes, unused services, upcoming debits and charges after cancelling, with the evidence and the right way to stop each one." }
];

export function Landing() {
  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/"><PayTraceLogo /></Link>
      <div>PAYMENTS · INSIGHTS · CONTROL</div>
      <Link href="/signin">Sign in →</Link>
    </header>
    <section className="account-welcome">
      <div className="login-intro">
        <p className="account-eyebrow">THE AUTO DEBITS NOBODY CAN FIND</p>
        <h1>Find every recurring payment, and stop the ones you don&apos;t want.</h1>
        <p>UPI AutoPay, card mandates, eNACH and app-store plans, explained in plain words, with the proof behind every warning.</p>
        <div className="landing-actions">
          <Link className="account-button primary" href="/signin">Sign in</Link>
          <Link className="account-button demo-button" href="/demo">Try the demo <span aria-hidden="true">→</span></Link>
          <Link className="account-button demo-button" href="/sandbox">Open the sandbox <span aria-hidden="true">→</span></Link>
        </div>
        <p className="login-footnote landing-note">Gmail sign-in is open only to approved test accounts while Google reviews the app. Evaluators: use the demo, or the sandbox to send your own SMS and emails. Neither needs a sign-in.</p>
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
