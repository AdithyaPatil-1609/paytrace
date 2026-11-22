"use client";
/**
 * Family Access (owner side), Family View (viewer side) and the accept page.
 * The browser never sends a profile id: every call is checked against the
 * session and, for viewing, against CAN_VIEW on the server, every time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FamilyOverview } from "@/db/neo4j/family";
import type { FamilyAlert, FamilySummary } from "@/lib/accounts/family";
import { FAMILY_LIMITS } from "@/lib/payments/rules";
import { formatINR } from "@/lib/presentation/format";

const PENDING = "paytrace-family-invite";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
const store = { get: () => { try { return sessionStorage.getItem(PENDING); } catch { return null; } }, set: (v: string) => { try { sessionStorage.setItem(PENDING, v); } catch { /* private mode */ } }, clear: () => { try { sessionStorage.removeItem(PENDING); } catch { /* private mode */ } } };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="account-shell">
    <header className="account-header"><Link href="/account"><strong>Paytrace</strong></Link><div>FAMILY ACCESS</div><Link href="/account">Back to your payments</Link></header>
    <div className="account-content">{children}</div>
  </main>;
}

const WHAT_IS_SHARED = <ul className="family-shares">
  <li>Shared: each recurring payment&apos;s name, amount, how often, next date and yearly cost, the totals, and Paytrace&apos;s warnings about them (a price rise, a charge after cancelling, a debit above its limit, a payment that looks unused, a debit due in the next days).</li>
  <li>Never shared: emails, SMS, bank statements, account numbers, references, phones or Gmail access.</li>
  <li>Read-only: they cannot change, cancel, sync or export anything.</li>
</ul>;

const LEVEL_TEXT: Record<FamilyAlert["level"], string> = { review: "Needs a look", soon: "Coming up", note: "Worth knowing" };

/** The owner's warnings, as plain sentences. The viewer can only read them and talk to the owner. */
function FamilyAlerts({ owner, alerts, incomplete }: { owner: string; alerts: FamilyAlert[]; incomplete: boolean }) {
  return <div className="family-alerts">
    <h3>Warnings</h3>
    {alerts.length ? <ul>
      {alerts.map((a, i) => <li key={`${a.kind}-${a.merchant}-${i}`} className={`family-alert ${a.level}`}>
        <span className="family-alert-level">{LEVEL_TEXT[a.level]}</span>
        <strong>{a.title}</strong>
        <p>{a.detail}</p>
      </li>)}
    </ul> : <p className="account-note">No warnings right now.</p>}
    {incomplete && <p className="account-note" role="status">Some warnings could not be checked just now, so this list may be missing some. It refreshes on its own.</p>}
    {alerts.length > 0 && <p className="account-note">Only {owner} can cancel, pause or dispute a payment. If something looks wrong, tell them.</p>}
  </div>;
}

/** The read-only view of one person's payments. Re-checks access every few seconds and clears itself when access ends. */
function FamilyView({ grantId, onEnded }: { grantId: string; onEnded: (owner: string) => void }) {
  const [data, setData] = useState<FamilySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const owner = useRef("");
  const load = useCallback(async () => {
    const response = await post("/api/family/summary", { grantId }).catch(() => null);
    if (response?.status === 401) { window.location.replace("/signin?notice=session-expired"); return; }
    // The parent closes this view and says why, so the notice outlives it.
    if (response?.status === 404 || response?.status === 403) { setData(null); onEnded(owner.current); return; }
    if (response?.ok) { const next: FamilySummary = await response.json(); owner.current = next.owner; setData(next); setFailed(false); setCheckedAt(new Date()); return; }
    setFailed(true);
  }, [grantId, onEnded]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), FAMILY_LIMITS.recheckMs);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [load]);
  if (!data) return <p className="account-note" role="status">{failed ? "Family View could not be loaded. It will retry in a few seconds." : "Loading…"}</p>;
  const alerts = data.alerts ?? [];
  const review = alerts.filter(a => a.level === "review").length;
  return <section className="family-view" aria-label={`${data.owner}'s recurring payments`}>
    <p className="account-eyebrow">FAMILY VIEW · READ-ONLY</p>
    <h2>{data.owner}&apos;s recurring payments</h2>
    <p className="family-banner">{data.owner} chose to share this with you until {day(data.expiresAt)}. You can see it, not change it.{review ? ` ${review} ${review === 1 ? "warning needs" : "warnings need"} a look.` : ""}</p>
    {failed && <p className="account-note" role="status">Could not refresh just now. Showing what was last loaded{checkedAt ? ` at ${checkedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}.</p>}
    <FamilyAlerts owner={data.owner} alerts={alerts} incomplete={Boolean(data.alertsIncomplete)}/>
    <h3>Payments</h3>
    <div className="family-totals">
      <div><span>Recurring payments</span><strong>{data.totals.count}</strong></div>
      <div><span>About a month</span><strong>{formatINR(data.totals.monthly)}</strong></div>
      <div><span>About a year</span><strong>{formatINR(data.totals.annual)}</strong></div>
    </div>
    <div className="account-table family-list">
      {data.payments.map((p, i) => <div key={`${p.merchant}-${i}`}><span><strong>{p.merchant}</strong><small>{p.product} · {p.cadence}{p.nextCharge ? ` · next ${day(p.nextCharge)}` : ""}</small></span><strong>{formatINR(p.amount)}<small>{formatINR(p.annualCost)} a year</small></strong></div>)}
      {!data.payments.length && <div><span><small>No recurring payments found yet.</small></span></div>}
    </div>
  </section>;
}

/** On the account page: a family invite the person opened before signing in, kept in this tab. */
export function FamilyInviteWaiting() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => { const first = setTimeout(() => setWaiting(Boolean(store.get())), 0); return () => clearTimeout(first); }, []);
  if (!waiting) return null;
  return <p className="account-banner family-waiting" role="status">You opened a family invite before signing in. <Link href="/family/accept">Continue to accept it</Link>.</p>;
}

export function FamilyAccess({ name }: { name: string }) {
  const [data, setData] = useState<FamilyOverview | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ended, setEnded] = useState("");
  const opened = useRef(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/family", { cache: "no-store" }).catch(() => null);
    if (response?.status === 401) { window.location.replace("/signin?notice=session-expired"); return; }
    if (!response?.ok) { setError("Family access could not be loaded. Retry in a moment."); return; }
    const next: FamilyOverview = await response.json();
    setData(next); setError("");
    // First load: open the view just accepted (#view=…), or the only one there is.
    if (!opened.current) {
      opened.current = true;
      const asked = new URLSearchParams(window.location.hash.slice(1)).get("view");
      if (asked) window.history.replaceState(null, "", window.location.pathname);
      const pick = next.sharedWithMe.find(g => g.grantId === asked) ?? (next.sharedWithMe.length === 1 ? next.sharedWithMe[0] : undefined);
      if (pick) setViewing(pick.grantId);
    }
    // A share that ended (removed or expired) closes its view.
    setViewing(current => current && !next.sharedWithMe.some(g => g.grantId === current) ? null : current);
  }, []);
  useEffect(() => { const first = setTimeout(() => { void load(); setPending(Boolean(store.get())); }, 0); return () => clearTimeout(first); }, [load]);
  const onEnded = useCallback((owner: string) => {
    setViewing(null);
    setEnded(`Your access to ${owner ? `${owner}'s` : "these"} payments has ended. They removed it or it expired. To see them again, ask for a new invite link.`);
    void load();
  }, [load]);

  async function act(url: string, body: unknown, failure: string) {
    setBusy(true); setError("");
    const response = await post(url, body).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) { setError(result.error ?? failure); return null; }
    await load();
    return result;
  }
  async function invite() {
    setCopied(false);
    const result = await act("/api/family/invite", {}, "Could not create an invite link.");
    if (result) setLink({ url: result.link, expiresAt: result.expiresAt });
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); }
  }
  async function share() {
    if (!link) return;
    try { await navigator.share({ title: "Paytrace family invite", text: `${name || "I"} would like to share recurring payments with you on Paytrace. The link works once, for ${FAMILY_LIMITS.inviteHours} hours.`, url: link.url }); } catch { /* closed or unsupported */ }
  }
  function open(grantId: string | null) {
    setViewing(grantId);
    if (grantId) setTimeout(() => viewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shared = data?.sharedWithMe ?? [];

  return <Shell>
    <p className="account-eyebrow">FAMILY ACCESS</p>
    <h1>Share a read-only view with family</h1>
    <p>{name ? `${name}, you` : "You"} choose who can see your recurring payments and their warnings, and you can take it back at any time. A family member can spot a price rise or a charge after cancelling and tell you, but cannot change anything.</p>
    {pending && <p className="family-banner">You have a family invite waiting. <Link href="/family/accept">Continue to accept it</Link>.</p>}
    {error && <p className="family-ended" role="alert">{error}</p>}
    {ended && <p className="family-ended" role="status">{ended}</p>}
    {shared.length > 0 && <section className="account-card family-shared">
      <p className="account-eyebrow">SHARED WITH YOU</p>
      <h2>Family View</h2>
      <div className="account-table family-list">
        {shared.map((g) => <div key={g.grantId}><span><strong>{g.owner}</strong><small>Read-only · until {day(g.until)}</small></span><span>
          <button className="link-button" aria-expanded={viewing === g.grantId} onClick={() => { setEnded(""); open(viewing === g.grantId ? null : g.grantId); }}>{viewing === g.grantId ? "Hide" : "View"}</button>{" · "}
          <button className="link-button" disabled={busy} onClick={() => { if (window.confirm(`Stop seeing ${g.owner}'s payments? You would need a new invite to see them again.`)) { setViewing(null); void act("/api/family/leave", { grantId: g.grantId }, "Could not update."); } }}>Stop viewing</button>
        </span></div>)}
      </div>
      <div ref={viewRef}>{viewing && <FamilyView key={viewing} grantId={viewing} onEnded={onEnded}/>}</div>
    </section>}
    <div className="family-grid">
      <section className="account-card">
        <p className="account-eyebrow">INVITE SOMEONE</p>
        <h2>Make a one-time link</h2>
        <p className="account-note">Send it yourself, by message or in person. It works once, for {FAMILY_LIMITS.inviteHours} hours, and the other person must sign in with their own Google account and accept. Access lasts {FAMILY_LIMITS.grantDays} days unless you remove it sooner.</p>
        {WHAT_IS_SHARED}
        <button className="account-button primary" disabled={busy} onClick={() => void invite()}>Create invite link</button>
        {link && <>
          <div className="family-link"><input readOnly aria-label="Invite link" value={link.url} onFocus={(e) => e.currentTarget.select()}/><button className="account-button small" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>{canShare && <button className="account-button small" onClick={() => void share()}>Share</button>}</div>
          <p className="account-note" role="status">Shown only now. Works until {day(link.expiresAt)}. Anyone with this link can ask to see your payments, so send it only to the right person.</p>
        </>}
        {data && data.invites.length > 0 && <div className="account-table family-list">
          {data.invites.map((i) => <div key={i.id}><span><strong>Unused invite link</strong><small>Made {day(i.createdAt)} · works until {day(i.expiresAt)}</small></span><button className="link-button" disabled={busy} onClick={() => void act("/api/family/invite/cancel", { id: i.id }, "Could not cancel.")}>Cancel link</button></div>)}
        </div>}
      </section>
      <section className="account-card">
        <p className="account-eyebrow">WHO CAN SEE YOUR PAYMENTS</p>
        <h2>People with access</h2>
        {!data ? <p className="account-note">Loading…</p> : data.viewers.length ? <div className="account-table family-list">
          {data.viewers.map((v) => <div key={v.grantId}><span><strong>{v.name}</strong><small>{v.email} · since {day(v.since)} · until {day(v.until)}</small></span><button className="account-button small danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${v.name}'s access now? They will stop seeing your payments straight away.`)) void act("/api/family/revoke", { grantId: v.grantId }, "Could not remove access."); }}>Remove access</button></div>)}
        </div> : <p className="account-note">Nobody can see your payments.</p>}
      </section>
      {data && !shared.length && <section className="account-card">
        <p className="account-eyebrow">SHARED WITH YOU</p>
        <h2>Family View</h2>
        <p className="account-note">Nobody has shared their payments with you. When someone sends you an invite link, open it and their payments and warnings show here.</p>
      </section>}
    </div>
  </Shell>;
}

type Peek = { ok: true; owner: string; grantDays: number } | { ok: false; error: string };

export function FamilyAccept() {
  const [token, setToken] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [grant, setGrant] = useState("");
  useEffect(() => {
    const first = setTimeout(async () => {
      const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("invite");
      if (fromLink) { store.set(fromLink); window.history.replaceState(null, "", window.location.pathname); }
      const value = fromLink ?? store.get();
      setToken(value);
      if (!value) return;
      const response = await post("/api/family/peek", { token: value }).catch(() => null);
      if (response?.status === 401) { setSignedOut(true); return; }
      const result = await response?.json().catch(() => null);
      if (!response?.ok) { setPeek({ ok: false, error: result?.error ?? "This invite link could not be checked. Retry in a moment." }); if (response?.status === 404 || response?.status === 400) store.clear(); return; }
      setPeek(result);
    }, 0);
    return () => clearTimeout(first);
  }, []);
  async function accept() {
    if (!token) return;
    setBusy(true);
    const response = await post("/api/family/accept", { token, consent: true }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok) { store.clear(); setGrant(String(result.grantId ?? "")); setDone(`You can now see ${result.owner}'s recurring payments and warnings, read-only, until ${day(result.expiresAt)}.`); return; }
    if (response?.status === 404) store.clear();
    setPeek({ ok: false, error: result?.error ?? "Could not accept. Retry in a moment." });
  }
  return <Shell>
    <section className="account-card" style={{ maxWidth: 620 }}>
      <p className="account-eyebrow">FAMILY INVITE</p>
      {!token ? <><h1 className="family-accept-title">No invite found</h1><p className="account-note">Open the full link you were sent. It ends with #invite=…</p></>
        : signedOut ? <><h1 className="family-accept-title">Sign in to continue</h1><p className="account-note">Sign in with your own Google account, then come back to this page. The invite is kept in this browser tab until you accept it.</p><Link className="account-button primary" href="/signin">Sign in</Link></>
        : done ? <><h1 className="family-accept-title">Invite accepted</h1><p className="account-note">{done}</p><Link className="account-button primary" href="/family">Open Family View</Link></>
        : !peek ? <p className="account-note">Checking the invite…</p>
        : !peek.ok ? <><h1 className="family-accept-title">This invite cannot be used</h1><p className="account-note" role="alert">{peek.error}</p><Link className="account-button" href="/family">Go to Family access</Link></>
        : <>
          <h1 className="family-accept-title">{peek.owner} wants to share their recurring payments with you</h1>
          <p className="account-note">If you accept, you can see a read-only list for {peek.grantDays} days. {peek.owner} can remove your access at any time, and you can stop viewing at any time.</p>
          {WHAT_IS_SHARED}
          <label className="family-consent"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}/> I want to see {peek.owner}&apos;s recurring payments, and I will keep them private.</label>
          <button className="account-button primary" disabled={!agreed || busy} onClick={() => void accept()}>Accept invite</button>
          <Link className="account-demo-link" href="/account" onClick={() => store.clear()}>Not now</Link>
        </>}
    </section>
  </Shell>;
}
