/**
 * Public privacy policy at /privacy. Google requires one before the sign-in
 * screen can be published, and it must describe what Paytrace really does.
 * Keep it in step with lib/accounts (sign-in, Gmail) and lib/ingestion (SMS).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy | Paytrace",
  description: "What Paytrace reads, what it keeps, and how to stop it."
};

const UPDATED = "21 November 2026";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 80px", lineHeight: 1.65 }}>
      <p style={{ marginBottom: 32 }}>
        <Link href="/">← Paytrace</Link>
      </p>
      <h1 style={{ fontSize: "2.2rem", marginBottom: 4 }}>Privacy policy</h1>
      <p style={{ color: "var(--ink-soft, #555)" }}>Last updated {UPDATED}</p>

      <p>
        Paytrace shows your recurring payments (subscriptions, autopays, EMIs and SIPs) and how to stop
        them. This page explains, in plain words, what Paytrace reads, what it keeps and what it never does.
      </p>

      <h2>1. Signing in with Google</h2>
      <p>
        When you choose <strong>Continue with Google</strong>, Paytrace receives your name, email address
        and Google account ID. It uses them only to create your account and keep you signed in. Sign-in does
        not give Paytrace access to your email.
      </p>

      <h2>2. Connecting Gmail (optional)</h2>
      <p>
        Connecting Gmail is a separate choice. If you agree, Google gives Paytrace <strong>read-only</strong>{" "}
        access to your Gmail (<code>gmail.readonly</code>). Paytrace can never send, change or delete email.
      </p>
      <ul>
        <li>
          Paytrace searches only for payment-related messages (receipts, renewal and price-change notices,
          scheduled debits, mandates).
        </li>
        <li>
          From each matching message it keeps only payment fields: merchant, amount, date, renewal date and
          frequency, and the kind of notice. <strong>The text of your emails is not stored.</strong>
        </li>
        <li>Messages that contain an OTP, PIN or password are skipped and never read for fields.</li>
        <li>
          Your Gmail access key is stored encrypted, and is deleted when you choose{" "}
          <strong>Disconnect Gmail</strong>. Paytrace also asks Google to revoke it.
        </li>
      </ul>

      <h2>3. Bank SMS (optional)</h2>
      <p>
        If you install the Paytrace companion app on Android and pair it, it forwards SMS from registered
        bank and payment senders only. Paytrace reads payment fields from each message and does not store
        the SMS text. Messages containing an OTP, PIN or password are dropped before they are read.
      </p>
      <p>
        On iPhone, no app can read SMS. If you choose <strong>Connect iPhone</strong>, you set up a Shortcut
        automation yourself that sends bank SMS about debits, mandates or autopay to Paytrace with a personal
        token. Only a fingerprint (hash) of the token is stored; <strong>Disconnect iPhone</strong> stops it at
        once. The same rules apply: registered senders only, OTP messages dropped, SMS text not stored.
      </p>

      <h2>4. How messages are read</h2>
      <p>
        Payment fields are extracted by rules and by an AI model that runs on Paytrace&apos;s own computer.
        Your messages are not sent to any outside AI service.
      </p>

      <h2>5. Google user data: Limited Use</h2>
      <p>
        Paytrace&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. In particular:
      </p>
      <ul>
        <li>Gmail data is used only to show you your own recurring payments.</li>
        <li>It is never sold, never used for advertising, and never shared with anyone else.</li>
        <li>It is not used to train AI models.</li>
        <li>No person reads your email, except with your explicit permission to resolve a problem you report.</li>
      </ul>

      <h2>6. Where data is kept</h2>
      <p>
        Your account and payment fields are stored in Paytrace&apos;s database and are visible only to you
        when you are signed in. Each account&apos;s data is kept separate. Connections use HTTPS.
      </p>

      <h2>7. Cookies</h2>
      <p>
        Paytrace uses only the cookies needed to keep you signed in and to protect sign-in from forgery. There
        are no advertising or tracking cookies.
      </p>

      <h2>8. Your choices</h2>
      <ul>
        <li>
          <strong>Stop Gmail access:</strong> use Disconnect Gmail in your account menu, or remove Paytrace at{" "}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          <strong>Delete your data:</strong> ask through the support email shown on Paytrace&apos;s Google
          sign-in screen, and your account and every stored payment field will be deleted.
        </li>
      </ul>

      <h2>9. Changes</h2>
      <p>If this policy changes, the date at the top changes too.</p>
    </main>
  );
}
