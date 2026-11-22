"use client";

/**
 * The public landing page: the PayTrace logo, product value proposition,
 * interactive preview cards, the signature watercolour wave backdrop, and a slide-over
 * sign-in drawer on the right side.
 */
import { useEffect, useState } from "react";
import { PayTraceLogo } from "@/components/paytrace-logo";
import Link from "next/link";

const AUTH_PATH = "/signin";
const DEMO_PATH = "/demo";

const steps = [
  {
    n: "01",
    title: "Connect",
    text: "Sign in with Google. Link Gmail (read-only) and the Paytrace phone app, only if you choose to."
  },
  {
    n: "02",
    title: "Read",
    text: "An AI model running on our own machine reads bank SMS and payment email, and every claim is checked against the original text."
  },
  {
    n: "03",
    title: "Act",
    text: "See price changes, unused services, upcoming debits and charges after cancelling, with the evidence and the right way to stop each one."
  }
];

const mockSubscriptions = [
  { name: "Netflix", cadence: "Monthly", cost: "₹649 /mo", badge: "trend" },
  { name: "Spotify", cadence: "Monthly", cost: "₹139 /mo", action: "Pause" },
  { name: "FitLine Gym", cadence: "Monthly", cost: "₹1,500 /mo", action: "Pause" },
  { name: "BESCOM", cadence: "Monthly", cost: "₹1,800 /mo", action: "Stop", danger: true },
  { name: "Google One", cadence: "Monthly", cost: "₹130 /mo", action: "Pause" }
];

export function Landing({
  configured = true,
  initialNotice = "",
  initialNoticeIsError = false,
  initialOpen = false
}: {
  configured?: boolean;
  initialNotice?: string;
  initialNoticeIsError?: boolean;
  initialOpen?: boolean;
}) {
  const [signInOpen, setSignInOpen] = useState(initialOpen);
  // One drawer for both: "Sign in" for an existing account, "Sign up" starts the sign-up steps.
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");

  // Close drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSignInOpen(false);
    }
    if (signInOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [signInOpen]);

  function openSignIn(e: React.MouseEvent) {
    e.preventDefault();
    setSignInOpen(true);
  }

  return (
    <main className="landing-shell">
      {/* ── Background Watercolour & Evidence Arc ── */}
      <div className="watercolour-bg" aria-hidden="true">
        <svg
          className="watercolour-canvas"
          viewBox="0 0 1440 450"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wash-teal-1" x1="0%" y1="100%" x2="40%" y2="0%">
              <stop offset="0%" stopColor="#4a9b9b" stopOpacity="0.45" />
              <stop offset="35%" stopColor="#78bebd" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#b4dedc" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#eaf5f4" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="wash-teal-2" x1="50%" y1="100%" x2="100%" y2="10%">
              <stop offset="0%" stopColor="#3d828a" stopOpacity="0.4" />
              <stop offset="40%" stopColor="#6aaeb5" stopOpacity="0.25" />
              <stop offset="80%" stopColor="#a8d7dc" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#f3f8f9" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="wash-soft" x1="20%" y1="100%" x2="70%" y2="0%">
              <stop offset="0%" stopColor="#55a5a2" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#94d0cd" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <filter id="soft-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <filter id="fine-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          {/* Deep organic watercolor pools */}
          <path
            d="M-40 450 L-40 280 Q140 210 360 270 T820 250 Q1120 180 1480 230 L1480 450 Z"
            fill="url(#wash-teal-1)"
            filter="url(#soft-blur)"
          />
          <path
            d="M-20 450 L-20 310 Q260 240 540 310 T1040 280 Q1280 220 1480 290 L1480 450 Z"
            fill="url(#wash-teal-2)"
            filter="url(#soft-blur)"
          />
          <path
            d="M100 450 C240 330 420 360 680 320 S1180 270 1460 340 L1460 450 Z"
            fill="url(#wash-soft)"
            filter="url(#fine-blur)"
          />

          {/* Fine coast edge */}
          <path
            d="M-20 330 Q220 260 490 315 T980 270 Q1240 220 1460 260"
            fill="none"
            stroke="rgba(61,130,138,0.18)"
            strokeWidth="1.8"
          />

          {/* Dotted Trajectory Arc with nodes */}
          <path
            d="M620 170 Q840 280 1020 220 T1300 240"
            fill="none"
            stroke="rgba(44,74,110,0.38)"
            strokeWidth="1.8"
            strokeDasharray="5 7"
          />
          {/* Tracking node dots */}
          <circle cx="730" cy="225" r="4.5" fill="#3d828a" />
          <circle cx="730" cy="225" r="8" fill="none" stroke="#3d828a" strokeWidth="1.2" strokeOpacity="0.4" />

          <circle cx="1020" cy="220" r="5" fill="#2c4a6e" />
          <circle cx="1020" cy="220" r="9.5" fill="none" stroke="#2c4a6e" strokeWidth="1.2" strokeOpacity="0.4" />

          <circle cx="1130" cy="216" r="3.5" fill="#3d828a" opacity="0.8" />
          <circle cx="1240" cy="230" r="3" fill="#2c4a6e" opacity="0.6" />

          {/* Arrowhead at the end of trajectory */}
          <polygon points="1295,236 1305,241 1296,246" fill="rgba(44,74,110,0.5)" />
        </svg>
      </div>

      {/* ── Top Navigation Bar ── */}
      <header className="landing-header">
        <Link className="wordmark" href="/" aria-label="PayTrace home">
          <PayTraceLogo />
        </Link>
        <nav className="landing-nav" aria-label="Product pillars">
          <span>PAYMENTS</span>
          <span className="dot-sep">·</span>
          <span>INSIGHTS</span>
          <span className="dot-sep">·</span>
          <span>CONTROL</span>
        </nav>
        <span aria-hidden="true" />
      </header>

      {/* ── Main Two-Column Hero ── */}
      <section className="landing-hero">
        {/* Left Column: Heading, Partners, CTA */}
        <div className="landing-left">
          <p className="landing-eyebrow">THE AUTO DEBITS NOBODY CAN FIND</p>
          <h1 className="landing-title">
            Find every<br />
            recurring<br />
            payment, and<br />
            stop the ones you<br />
            don&apos;t want.
          </h1>

          <div className="landing-integrations">
            <span className="integrations-label">Works with your favorite apps &amp; accounts</span>
            <div className="integrations-strip">
              <span className="partner-badge" title="Bank Statements">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2L2 7v2h20V7L12 2zm-8 7h3v9H4V9zm6 0h3v9h-3V9zm6 0h3v9h-3V9zm-14 11v2h20v-2H2z" />
                </svg>
              </span>
              <span className="partner-badge" title="UPI & Mandates">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </span>
              <span className="partner-badge text-glyph" title="PayPal">
                <b>P</b>
              </span>
              <span className="partner-badge text-glyph" title="Mandates">
                <b>M</b>
              </span>
              <span className="partner-badge" title="Amazon & E-Commerce">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </span>
              <span className="partner-badge" title="Spotify">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.72 1.115.295.18.388.562.208.855zm1.225-2.723c-.226.367-.709.482-1.075.257-2.689-1.653-6.788-2.131-9.967-1.166-.413.126-.849-.108-.975-.52-.125-.414.108-.85.52-.976 3.632-1.102 8.147-.568 11.24 1.33.366.225.481.708.257 1.075zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.13-1.166-.624-.15-.493.13-1.017.624-1.167 3.532-1.072 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.281.328z" />
                </svg>
              </span>
              <span className="partner-badge text-glyph" title="NPCI">
                <small>npci</small>
              </span>
            </div>
          </div>

          <div className="landing-actions">
            <Link className="action-btn action-primary" href={AUTH_PATH} onClick={openSignIn}>
              Sign in / Sign up
            </Link>
            <Link className="action-btn action-outline" href={DEMO_PATH}>
              Try the demo <span aria-hidden="true">→</span>
            </Link>
          </div>

          <p className="landing-footnote">
            Gmail sign-in is open only to approved test accounts while Google reviews the app.
            Evaluators: use the demo, which needs no sign-in.
          </p>
        </div>

        {/* Right Column: How it Works & Preview Widgets */}
        <div className="landing-right">
          <p className="landing-eyebrow">HOW IT WORKS</p>

          <div className="landing-steps">
            {steps.map((step) => (
              <div className="step-row" key={step.n}>
                <span className="step-num">{step.n}</span>
                <div className="step-content">
                  <strong className="step-title">{step.title}</strong>
                  <p className="step-text">{step.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Cards Grid: Subscribers Dashboard + Private by design */}
          <div className="landing-cards-grid">
            {/* Card 1: Subscribers Dashboard Mini Preview */}
            <article className="preview-card mini-dashboard-card">
              <header className="card-top">
                <strong>Subscribers Dashboard</strong>
                <span className="tracking-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  Tracking
                </span>
              </header>

              <div className="mini-sub-list">
                {mockSubscriptions.map((sub) => (
                  <div className="mini-sub-row" key={sub.name}>
                    <div className="sub-avatar">{sub.name.charAt(0)}</div>
                    <div className="sub-info">
                      <span className="sub-name">{sub.name}</span>
                      <small className="sub-cadence">{sub.cadence}</small>
                    </div>
                    <span className="sub-price">{sub.cost}</span>
                    <div className="sub-action">
                      {sub.badge === "trend" ? (
                        <span className="trend-spark">📈</span>
                      ) : (
                        <span className={sub.danger ? "sub-btn danger" : "sub-btn"}>
                          {sub.action}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            {/* Card 2: Private by design */}
            <article className="preview-card privacy-card">
              <p className="card-eyebrow">YOUR DATA, YOUR PERMISSION</p>
              <h3>Private by design</h3>
              <ul className="privacy-list">
                <li>
                  <span className="icon-lock" aria-hidden="true">🔒</span>
                  <span>Read-only Gmail. One-time passwords never leave your phone.</span>
                </li>
                <li>
                  <span className="icon-check" aria-hidden="true">✓</span>
                  <span>Your data is kept apart from everyone else&apos;s and can be deleted at any time.</span>
                </li>
              </ul>
              <Link className="privacy-link" href="/privacy">
                How we protect your data <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* ── Slide-in Sign-in Drawer (Right Side) ── */}
      <div
        className={`signin-drawer-backdrop ${signInOpen ? "open" : ""}`}
        onClick={() => setSignInOpen(false)}
        aria-hidden={!signInOpen}
      />

      {signInOpen && (
        <aside
          className={`signin-drawer ${signInOpen ? "open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          <header className="drawer-header">
            <span className="drawer-eyebrow">YOUR PERSONAL ACCOUNT</span>
            <button
              className="drawer-close-btn"
              onClick={() => setSignInOpen(false)}
              aria-label="Close sign in dialog"
            >
              ✕
            </button>
          </header>

          <div className="drawer-body">
            <div className="signup-tabs drawer-tabs" role="tablist" aria-label="Sign in or sign up">
              <button role="tab" type="button" aria-selected={authTab === "signin"} className={authTab === "signin" ? "active" : ""} onClick={() => setAuthTab("signin")}>Sign in</button>
              <button role="tab" type="button" aria-selected={authTab === "signup"} className={authTab === "signup" ? "active" : ""} onClick={() => setAuthTab("signup")}>Sign up</button>
            </div>
            <h2 id="drawer-title">{authTab === "signin" ? "Sign in to Paytrace" : "Create your Paytrace account"}</h2>
            <p className="drawer-subtitle">
              {authTab === "signin"
                ? "See your own recurring payments. After signing in, you choose whether to connect Gmail (read-only) and your phone."
                : "Takes about two minutes: your name, an optional phone check, Gmail (read-only), then Paytrace finds your recurring payments while you watch."}
            </p>

            {initialNotice && (
              <div
                className={initialNoticeIsError ? "account-banner account-banner-error" : "account-banner"}
                role={initialNoticeIsError ? "alert" : "status"}
                style={{ marginBottom: "18px" }}
              >
                {initialNotice}
              </div>
            )}

            {configured && authTab === "signup" ? (
              <form action="/api/auth/google/start" method="post" className="drawer-form signup-form">
                <input type="hidden" name="mode" value="login" />
                <input type="hidden" name="next" value="signup" />
                <label className="signup-field">Full name
                  <input name="fullName" required minLength={2} maxLength={80} autoComplete="name" placeholder="As you want it shown" />
                </label>
                <button className="account-button primary google-button drawer-google-btn" type="submit">
                  <span className="google-icon" aria-hidden="true">G</span>
                  Sign up with Google
                </button>
              </form>
            ) : configured ? (
              <form action="/api/auth/google/start" method="post" className="drawer-form">
                <input type="hidden" name="mode" value="login" />
                <button className="account-button primary google-button drawer-google-btn" type="submit">
                  <span className="google-icon" aria-hidden="true">G</span>
                  Continue with Google
                </button>
              </form>
            ) : (
              <p className="account-warning">
                Google sign-in is not configured on this server. You can still explore the demo.
              </p>
            )}

            <div className="signin-limit drawer-limit">
              <strong>Approved test accounts only.</strong> Until Google completes its
              security review, only Google accounts we have approved can sign in. Evaluators:
              please use the demo.
            </div>

            <Link
              className="account-button demo-button drawer-demo-btn"
              href={DEMO_PATH}
              onClick={() => setSignInOpen(false)}
            >
              Try the demo instead <span aria-hidden="true">→</span>
            </Link>

            <footer className="drawer-footer">
              <p className="login-footnote">
                By signing in you agree to our <Link href="/privacy">privacy notice</Link>.
              </p>
            </footer>
          </div>
        </aside>
      )}
    </main>
  );
}
