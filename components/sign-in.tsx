/**
 * The sign-in page: one Google button, any notice from the sign-in flow,
 * the test-account limit, and a way back to the demo or the landing page.
 */
import { PayTraceLogo } from "@/components/paytrace-logo";
import Link from "next/link";

export function SignIn({ configured, notice, noticeIsError }: { configured: boolean; notice?: string; noticeIsError?: boolean }) {
  return <main className="account-shell login-ledger">
    <header className="account-header">
      <Link className="wordmark" href="/"><PayTraceLogo /></Link>
      <div>SIGN IN</div>
      <Link href="/demo">Try demo →</Link>
    </header>
    <section className="signin-wrap">
      {notice && <div className={noticeIsError ? "account-banner account-banner-error" : "account-banner"} role={noticeIsError ? "alert" : "status"}>{notice}</div>}
      <article className="account-card login-choice signin-card">
        <p className="account-eyebrow">YOUR PERSONAL ACCOUNT</p>
        <h1>Sign in to Paytrace</h1>
        <p>See your own recurring payments. After signing in, you choose whether to connect Gmail (read-only) and your phone.</p>
        {configured
          ? <form action="/api/auth/google/start" method="post">
              <input type="hidden" name="mode" value="login" />
              <button className="account-button primary google-button" type="submit"><span aria-hidden="true">G</span> Continue with Google</button>
            </form>
          : <p className="account-warning">Google sign-in is not configured on this server. You can still explore the demo.</p>}
        <p className="signin-limit"><strong>Approved test accounts only.</strong> Until Google completes its security review, only Google accounts we have approved can sign in. Evaluators: please use the demo.</p>
        <Link className="account-button demo-button" href="/demo">Try the demo instead <span aria-hidden="true">→</span></Link>
        <p className="login-footnote">By signing in you agree to our <Link href="/privacy">privacy notice</Link>. <Link href="/">Back to home</Link></p>
      </article>
    </section>
  </main>;
}
