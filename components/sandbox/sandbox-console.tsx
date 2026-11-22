"use client";
/**
 * The sandbox console: a drop-down under "Try it" where a visitor loads the
 * sample bank statement, types their own message, or tries to break PayTrace,
 * and sees every check each message went through.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SandboxAlert, SandboxView } from "@/lib/sandbox/dataset";
import type { SandboxLogEntry } from "@/lib/sandbox/store";
import { ATTACKS, EMAIL_TEMPLATES, SMS_TEMPLATES, datesAfter, type Attack, type Template } from "@/lib/sandbox/templates";
import "./sandbox.css";

type Tab = "statement" | "type" | "break" | "activity";
type Props = { asOf: string; alerts: SandboxAlert[]; log: SandboxLogEntry[]; counts: SandboxView["counts"]; statement: SandboxView["statement"] };

const TABS: { id: Tab; label: string }[] = [
  { id: "statement", label: "Bank statement" },
  { id: "type", label: "Type your own" },
  { id: "break", label: "Try to break it" },
  { id: "activity", label: "Activity" }
];
const DEFAULT_SENDER = { sms: "AX-ARCBNK-S", email: "billing@example.com" } as const;
/** Samples under the "Type your own" box: a click fills the form, the visitor can edit, then send. */
const SAMPLE_IDS = ["sms-price", "sms-upcoming", "mail-trial", "mail-promo"];
const SAMPLES: Template[] = SAMPLE_IDS.map(id => [...SMS_TEMPLATES, ...EMAIL_TEMPLATES].find(t => t.id === id)).filter((t): t is Template => Boolean(t));
const OPEN_EVENT = "paytrace:open-sandbox";

/** The "Try it" button in the demo's top bar, left of the profile menu. It opens the console. */
export function SandboxLauncher({ count }: { count: number }) {
  return <button className="sbx-launcher" type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} aria-label="Open the try-it console">
    Try it<span className="sbx-launcher-long">: send a message</span>{count ? <span className="sbx-count">{count}</span> : null}
  </button>;
}

export function SandboxConsole({ asOf, alerts, log, counts, statement }: Props) {
  const router = useRouter();
  // A drop-down under the "Try it" button: closed until clicked, closes on Esc or a click outside.
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    const toggle = () => {
      // Line the drop-down up under the button that opened it.
      const button = document.querySelector(".sbx-launcher")?.getBoundingClientRect();
      if (button) setPlace({ top: Math.round(button.bottom + 10), right: Math.max(8, Math.round(window.innerWidth - button.right)) });
      setOpen(value => !value);
    };
    window.addEventListener(OPEN_EVENT, toggle);
    return () => window.removeEventListener(OPEN_EVENT, toggle);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
      const target = event.target as Element | null;
      if (panel.current?.contains(target) || target?.closest?.(".sbx-launcher")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const [tab, setTab] = useState<Tab>("statement");
  const [busy, setBusy] = useState<string | null>(null);
  // Each answer is shown right under the button that asked for it, with the server's real reply.
  const [results, setResults] = useState<{ origin: string; replies: Reply[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [sender, setSender] = useState<string>(DEFAULT_SENDER.sms);
  const [text, setText] = useState("");


  async function run(origin: string, label: string, work: () => Promise<Reply[]>) {
    if (busy) return;
    setBusy(label); setError(null); setResults({ origin, replies: [] });
    try {
      setResults({ origin, replies: await work() });
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server. Try again.");
    } finally { setBusy(null); }
  }

  const sendAttack = (attack: Attack) => run(`attack:${attack.id}`, attack.label, async () => {
    if (attack.kind === "signed") return [await post("/api/sandbox/attack", { attack: attack.attack })];
    const message = { channel: attack.channel, sender: attack.sender, text: attack.text(datesAfter(asOf)) };
    const out: Reply[] = [];
    for (let i = 0; i < (attack.times ?? 1); i++) out.push(await post("/api/sandbox/message", message));
    return out;
  });

  const loadSample = () => run("statement", "Making a new sample person", async () => [await post("/api/sandbox/statement", { action: "sample" })]);
  const backToDemo = () => run("statement", "Switching back", async () => [await post("/api/sandbox/statement", { action: "clear" })]);

  const sendTyped = () => run("type", "Your message", async () => [await post("/api/sandbox/message", { channel, sender, text })]);

  async function reset() {
    if (busy) return;
    setBusy("Reset");
    await fetch("/api/sandbox/reset", { method: "POST" }).catch(() => undefined);
    setResults(null); setError(null); setBusy(null);
    startTransition(() => router.refresh());
  }

  /** "Change it and send": the attack's own text goes into the box, so a visitor can reword it and see the same checks decide. */
  function editAttack(attack: Attack) {
    if (attack.kind === "signed") return;
    setChannel(attack.channel); setSender(attack.sender); setText(attack.text(datesAfter(asOf))); setTab("type");
  }
  const answers = (origin: string) => results?.origin === origin
    ? <div className="sbx-answers">{busy && !results.replies.length ? <p className="sbx-busy" role="status">{busy}: running the checks…</p> : results.replies.map((reply, i) => <Answer key={i} reply={reply} />)}</div>
    : null;

  if (!open) {
    return null;
  }

  return <aside className="sbx-panel" aria-label="Sandbox console" ref={panel} style={place && window.innerWidth > 700 ? { top: place.top, right: place.right, maxHeight: `calc(100vh - ${place.top + 16}px)` } : undefined}>
    <header className="sbx-head">
      <div>
        <p className="sbx-eyebrow">TRY IT · PRIVATE TO YOU · DELETED AFTER 2 HOURS</p>
        <h2>Send a message, watch the demo react</h2>
        <p className="sbx-meta">Sandbox date <b>{asOf}</b> · {counts.accepted} saved · {counts.refused} refused</p>
      </div>
      <div className="sbx-head-actions">
        <button type="button" className="sbx-link" onClick={() => void reset()} disabled={Boolean(busy)}>Reset</button>
        <button type="button" className="sbx-close" onClick={() => setOpen(false)} aria-label="Hide the try-it console">×</button>
      </div>
    </header>

    {alerts.length > 0 && <section className="sbx-alerts" aria-label="Warnings">
      {alerts.slice(0, 3).map(alert => <div key={`${alert.n}-${alert.kind}`} className={`sbx-alert sbx-${alert.kind}`}><strong>{alert.title}</strong><span>{alert.detail}</span></div>)}
      {alerts.length > 3 && <button type="button" className="sbx-link" onClick={() => setTab("activity")}>All {alerts.length} warnings →</button>}
    </section>}

    <nav className="sbx-tabs" role="tablist">
      {TABS.map(item => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>

    <div className="sbx-body">
      {busy && <p className="sbx-busy" role="status">{busy}: running the checks{busy === "Reset" ? "" : " and the AI reader"}…</p>}
      {error && <p className="sbx-error" role="alert">{error}</p>}

      {tab === "statement" && <div className="sbx-list">
        <p className="sbx-note">Use a bank statement instead of the demo person&apos;s. Paytrace finds the recurring payments and the four warnings in it. It stays in this server&apos;s memory for two hours, only for you, and is never stored.</p>
        {statement && <div className="sbx-alert sbx-price_notice"><strong>Using: {statement.name}</strong><span>{statement.lines} transactions ({statement.debits} debits), {statement.from} to {statement.to}{statement.skipped ? `, ${statement.skipped} rows skipped` : ""}.</span></div>}
        <button type="button" className="sbx-item" disabled={Boolean(busy)} onClick={() => void loadSample()}><strong>{statement?.source === "sample" ? "Load a new set of sample statements" : "Load a set of sample statements"}</strong><span>A new made-up person each click: 12 months of salary, rent, bills, shopping and subscriptions, with different services and prices</span></button>
        {statement && <button type="button" className="sbx-link" disabled={Boolean(busy)} onClick={() => void backToDemo()}>Back to the demo data</button>}
        {answers("statement")}
      </div>}
      {tab === "type" && <form className="sbx-type" onSubmit={event => { event.preventDefault(); void sendTyped(); }}>
        <p className="sbx-note">Paste or type any SMS or email. It is read by the same AI and checks, and only kept in your sandbox.</p>
        <div className="sbx-radio" role="radiogroup" aria-label="Message type">
          {(["sms", "email"] as const).map(value => <label key={value}><input type="radio" name="sbx-channel" checked={channel === value} onChange={() => { setChannel(value); setSender(DEFAULT_SENDER[value]); }} /> {value === "sms" ? "Bank SMS" : "Email"}</label>)}
        </div>
        <label className="sbx-field">{channel === "sms" ? "Sender ID" : "From"}<input value={sender} onChange={event => setSender(event.target.value)} maxLength={80} required /></label>
        <label className="sbx-field">Message<textarea value={text} onChange={event => setText(event.target.value)} rows={6} maxLength={5000} required placeholder={channel === "sms" ? "Rs 499.00 debited from A/c XX1234 on 22-11-26 for UPI/NETFLIX. Ref 123456. -HDFC Bank" : "Subject: Your receipt\n\nAmount charged: Rs 649.00 on 22 Nov 2026…"} /></label>
        <div className="sbx-samples">
          <span>Try a sample:</span>
          {SAMPLES.map(sample => <button key={sample.id} type="button" className="sbx-chip" title={sample.hint} onClick={() => { setChannel(sample.channel === "email" ? "email" : "sms"); setSender(sample.sender); setText(sample.text(datesAfter(asOf))); }}>{sample.label}</button>)}
        </div>
        <button className="sbx-primary" type="submit" disabled={Boolean(busy) || !text.trim()}>{channel === "sms" ? "Send the SMS" : "Send the email"}</button>
        {answers("type")}
      </form>}
      {tab === "break" && <div className="sbx-list">
        <p className="sbx-note">Each button sends a hostile message or request. A green result means Paytrace refused it, as it should.</p>
        {ATTACKS.map(attack => <div key={attack.id} className="sbx-attack">
          <button type="button" className="sbx-item" disabled={Boolean(busy)} onClick={() => void sendAttack(attack)}><strong>{attack.label}</strong><span>Expected: {attack.expect}</span></button>
          {answers(`attack:${attack.id}`)}
          {results?.origin === `attack:${attack.id}` && attack.kind !== "signed" && !busy && <button type="button" className="sbx-link" onClick={() => editAttack(attack)}>Change the wording and send it yourself →</button>}
        </div>)}
      </div>}
      {tab === "activity" && <div className="sbx-list">
        {alerts.length > 0 && <><h3>Warnings</h3>{alerts.map(alert => <div key={`a-${alert.n}-${alert.kind}`} className={`sbx-alert sbx-${alert.kind}`}><strong>{alert.title}</strong><span>{alert.detail}</span></div>)}</>}
        <h3>Messages ({log.length})</h3>
        {log.length === 0 ? <p className="sbx-note">Nothing sent yet.</p> : log.map(entry => <Result key={`log-${entry.n}`} entry={entry} compact />)}
      </div>}
    </div>
  </aside>;
}

/** Sends one request and keeps the server's reply as it came: status, time taken, body. */
async function post(url: string, body: unknown): Promise<Reply> {
  const started = performance.now();
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  const ms = Math.round(performance.now() - started);
  if (!response.ok) return { url, status: response.status, ms, error: typeof data.error === "string" ? data.error : "Refused" };
  return { url, status: response.status, ms, entry: data as SandboxLogEntry };
}

type Reply = { url: string; status: number; ms: number; entry?: SandboxLogEntry; error?: string };

/** The server's real answer: the HTTP status, the time it took, what was sent, and every check it ran. */
function Answer({ reply }: { reply: Reply }) {
  const meta = <p className="sbx-http"><code>POST {reply.url}</code> → <b className={reply.status < 300 ? "ok" : "no"}>HTTP {reply.status}</b> in {reply.ms} ms</p>;
  if (!reply.entry) return <div className="sbx-result sbx-refused">{meta}<p><b>Refused by the server:</b> {reply.error}</p></div>;
  return <div className="sbx-answer">{meta}<Result entry={reply.entry} /></div>;
}

function Result({ entry, compact = false }: { entry: SandboxLogEntry; compact?: boolean }) {
  const held = entry.channel === "phone" ? entry.accepted : true;
  const tone = entry.channel === "phone" ? (held ? "ok" : "bad") : entry.accepted ? "ok" : "refused";
  return <details className={`sbx-result sbx-${tone}`} open={!compact}>
    <summary><b>#{entry.n}</b> {entry.summary}<small>{entry.channel === "phone" ? "signed request" : entry.channel === "statement" ? "bank statement" : `${entry.channel.toUpperCase()} · ${entry.sender}`}</small></summary>
    <p className="sbx-preview">{entry.preview}</p>
    <ol>{entry.steps.map((step, i) => <li key={i} className={step.ok ? "pass" : "fail"}><b>{step.ok ? "✓" : "✕"} {step.name}</b> {step.detail}</li>)}</ol>
  </details>;
}
