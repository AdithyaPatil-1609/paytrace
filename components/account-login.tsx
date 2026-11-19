import Link from "next/link";

export function AccountLogin({configured, unavailable=false, notice}: {configured:boolean; unavailable?:boolean; notice?:string}) {
  return <main className="account-shell login-ledger">
    <header className="account-header"><Link className="wordmark" href="/account">paytrace<span>p</span></Link><div>PAYMENTS · INSIGHTS · CONTROL</div><Link href="/?demo=1">Try demo →</Link></header>
    {notice && <div className="account-banner" role="status">{notice}</div>}
    <section className="account-welcome">
      <div className="login-intro"><p className="account-eyebrow">YOUR MONEY, MADE CLEAR</p><h1>See every recurring payment clearly.</h1><p>Understand what is leaving your account, discover surprising charges, and find the right way to stop them.</p>
        <div className="login-proof"><span>01</span><div><strong>All payments in one place</strong><p>Subscriptions, bills, loans and autopays.</p></div><span>02</span><div><strong>Evidence behind every finding</strong><p>Know why a payment is flagged.</p></div><span>03</span><div><strong>Your data, your permission</strong><p>Gmail linking is optional and read-only.</p></div></div>
      </div>
      <div className="login-options"><p className="account-eyebrow">WELCOME TO PAYTRACE</p><h2>Choose how to explore.</h2>
        <article className="account-card login-choice"><p className="account-eyebrow">01 · YOUR PERSONAL ACCOUNT</p><h3>Sign in with Google</h3><p>See your own recurring payments. Choose whether to connect Gmail after signing in.</p>
          {configured&&!unavailable?<form action="/api/auth/google/start" method="post"><input type="hidden" name="mode" value="login"/><button className="account-button primary google-button" type="submit"><span aria-hidden="true">G</span> Continue with Google</button></form>:<p className="account-warning">{unavailable?"Neo4j unavailable. Start the database and reload.":"Google sign-in is not configured. You can still explore Priya's demo."}</p>}
        </article>
        <article className="account-card login-choice demo-choice"><p className="account-eyebrow">02 · SAMPLE DATA · NO LOGIN</p><h3>Explore Priya&apos;s demo</h3><p>Try all five screens using Priya Desai&apos;s preloaded synthetic payments. No sign-in or email access needed.</p><Link className="account-button demo-button" href="/?demo=1">View static demo (Priya) <span aria-hidden="true">→</span></Link></article>
        <p className="login-footnote">Personal and demo data are kept separate.</p>
      </div>
    </section>
  </main>;
}
