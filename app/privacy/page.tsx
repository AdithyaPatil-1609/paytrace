/**
 * /privacy: the plain-language privacy notice, written to the principles of
 * India's Digital Personal Data Protection Act 2023: a stated purpose, the
 * minimum data, consent that can be withdrawn, and where the data goes.
 */
import Link from "next/link";
import "../account/account.css";
import "../account/login.css";

export const metadata = { title: "Privacy · Paytrace" };

const sections: { title: string; points: string[] }[] = [
  { title: "Why we use your data", points: [
    "Only to find your recurring payments (autopays, mandates, subscriptions), warn you about problems with them, and show how to stop them.",
    "We do not sell, share or use your data for advertising, and we do not train shared AI models on it."
  ] },
  { title: "What we read", points: [
    "Your Google name and email address, to sign you in.",
    "Gmail, only if you connect it, with read-only permission. We look for payment, renewal and mandate emails and ignore everything else.",
    "Bank SMS, only if you install the Paytrace phone app. One-time passwords (OTPs) are dropped on your phone and never sent to us.",
    "From each message we keep only the payment details: merchant, amount, date, reference and the last four digits of the account."
  ] },
  { title: "Where your data goes", points: [
    "Messages are read by an AI model (Qwen) running on our own machine, not by a cloud service.",
    "Payment details are stored in a Neo4j AuraDB cloud database, kept apart from every other person's data.",
    "Google Gemini is used only if you turn on cloud AI yourself. It is off by default.",
    "Your Gmail access token is encrypted (AES-256-GCM) before it is stored."
  ] },
  { title: "Your choices", points: [
    "Gmail and the phone app are optional. You can use Paytrace, or the demo, without them.",
    "Disconnect Gmail at any time from your account. We revoke our access at Google and stop reading.",
    "You can sign out from every device, and ask us to delete all of your data."
  ] },
  { title: "How we protect it", points: [
    "Encrypted connections (HTTPS) only, secure HttpOnly session cookies, and request limits on every address.",
    "Phone messages must come from a registered bank sender, and every value the AI reads is checked against the original text.",
    "Automated security tests on every change, secret scanning of our code, and ArgosX security scans."
  ] }
];

export default function PrivacyPage() {
  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/">paytrace<span>p</span></Link>
      <div>PRIVACY</div>
      <Link href="/signin">Sign in →</Link>
    </header>
    <section className="privacy-wrap">
      <p className="account-eyebrow">PRIVACY NOTICE</p>
      <h1>How Paytrace uses and protects your data</h1>
      <p>Paytrace is a hackathon product built by team Taporis. This notice follows the principles of India&apos;s Digital Personal Data Protection Act, 2023.</p>
      {sections.map(section => <div key={section.title} className="privacy-section">
        <h2>{section.title}</h2>
        <ul>{section.points.map(point => <li key={point}>{point}</li>)}</ul>
      </div>)}
      <p className="login-footnote"><Link href="/">Back to home</Link> · <Link href="/demo">Try the demo</Link></p>
    </section>
  </main>;
}
