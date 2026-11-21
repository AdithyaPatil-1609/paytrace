"use client";
/**
 * The sandbox console: a panel beside the five screens where a visitor sends
 * synthetic bank SMS and emails, types their own message, or tries to break
 * Paytrace, and sees every check each message went through.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SandboxAlert, SandboxView } from "@/lib/sandbox/dataset";
import type { SandboxLogEntry } from "@/lib/sandbox/store";
import { ATTACKS, EMAIL_TEMPLATES, SMS_TEMPLATES, datesAfter, type Attack, type Template } from "@/lib/sandbox/templates";
import { generateStatement, statementCsv } from "@/lib/statements/generate";
import { STATEMENT_LIMITS } from "@/lib/statements/csv";
import "./sandbox.css";

type Tab = "statement" | "sms" | "email" | "type" | "break" | "activity";
type Props = { asOf: string; alerts: SandboxAlert[]; log: SandboxLogEntry[]; counts: SandboxView["counts"]; statement: SandboxView["statement"] };

const TABS: { id: Tab; label: string }[] = [
  { id: "statement", label: "Bank statement" },
  { id: "sms", label: "Bank SMS" },
  { id: "email", label: "Email" },
  { id: "type", label: "Type your own" },
  { id: "break", label: "Try to break it" },
  { id: "activity", label: "Activity" }
];
const DEFAULT_SENDER = { sms: "AX-ARCBNK-S", email: "billing@example.com" } as const;

export function SandboxConsole({ asOf, alerts, log, counts, statement }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("statement");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<SandboxLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [sender, setSender] = useState<string>(DEFAULT_SENDER.sms);
  const [text, setText] = useState("");

  async function post(url: string, body: unknown): Promise<SandboxLogEntry | null> {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(typeof data.error === "string" ? data.error : `Request failed (${response.status})`); return null; }
    return data as SandboxLogEntry;
  }

  async function run(label: string, work: () => Promise<(SandboxLogEntry | null)[]>) {
    if (busy) return;
    setBusy(label); setError(null);
    try {
      const done = (await work()).filter((x): x is SandboxLogEntry => Boolean(x));
      setResults(done);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server. Try again.");
    } finally { setBusy(null); }
  }

  const sendTemplate = (template: Template) => run(template.label, async () => {
    const d = datesAfter(asOf);
    return [await post("/api/sandbox/message", { channel: template.channel, sender: template.sender, text: template.text(d) })];
  });

  const sendAttack = (attack: Attack) => run(attack.label, async () => {
    if (attack.kind === "signed") return [await post("/api/sandbox/attack", { attack: attack.attack })];
    const message = { channel: attack.channel, sender: attack.sender, text: attack.text(datesAfter(asOf)) };
    const out: (SandboxLogEntry | null)[] = [];
    for (let i = 0; i < (attack.times ?? 1); i++) out.push(await post("/api/sandbox/message", message));
    return out;
  });

  const loadSample = () => run("Loading a sample statement", async () => [await post("/api/sandbox/statement", { action: "sample" })]);
  const backToDemo = () => run("Switching back", async () => [await post("/api/sandbox/statement", { action: "clear" })]);
  const upload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > STATEMENT_LIMITS.maxBytes) { setError(`The file is larger than ${STATEMENT_LIMITS.maxBytes / 1024} KB. Export a shorter period, such as 12 months.`); return; }
    void run("Reading your statement", async () => [await post("/api/sandbox/statement", { action: "upload", name: file.name, csv: await file.text() })]);
  };
  function downloadSample() {
    const csv = statementCsv(generateStatement("sample-download", new Date().toISOString().slice(0, 10)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "paytrace-sample-statement.csv" });
    link.click();
    URL.revokeObjectURL(url);
  }

  const sendTyped = () => run("Your message", async () => [await post("/api/sandbox/message", { channel, sender, text })]);

  async function reset() {
    if (busy) return;
    setBusy("Reset");
    await fetch("/api/sandbox/reset", { method: "POST" }).catch(() => undefined);
    setResults([]); setError(null); setBusy(null);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return <button className="sbx-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open the try-it console">Try it: send a message{alerts.length ? <span>{alerts.length}</span> : null}</button>;
  }

  return <aside className="sbx-panel" aria-label="Sandbox console">
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
      {results.map(result => <Result key={result.n} entry={result} />)}

      {tab === "statement" && <div className="sbx-list">
        <p className="sbx-note">Use a bank statement instead of the demo person&apos;s. Paytrace finds the recurring payments and the four warnings in it. It stays in this server&apos;s memory for two hours, only for you, and is never stored.</p>
        {statement && <div className="sbx-alert sbx-price_notice"><strong>Using: {statement.name}</strong><span>{statement.lines} transactions ({statement.debits} debits), {statement.from} to {statement.to}{statement.skipped ? `, ${statement.skipped} rows skipped` : ""}.</span></div>}
        <button type="button" className="sbx-item" disabled={Boolean(busy)} onClick={() => void loadSample()}><strong>Load a sample statement</strong><span>12 months: salary, rent, bills, shopping and subscriptions</span></button>
        <label className="sbx-item sbx-upload"><strong>Upload your statement (CSV)</strong><span>From net banking: download the statement as CSV, or save the Excel file as CSV. Up to {STATEMENT_LIMITS.maxBytes / 1024} KB.</span>
          <input type="file" accept=".csv,text/csv" disabled={Boolean(busy)} onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <button type="button" className="sbx-link" onClick={downloadSample}>Download the sample as a CSV file</button>
        {statement && <button type="button" className="sbx-link" disabled={Boolean(busy)} onClick={() => void backToDemo()}>Back to the demo data</button>}
      </div>}
      {tab === "sms" && <Templates intro="Real-looking bank SMS from a registered sender. Each one goes through the same checks and AI reader as a real phone." list={SMS_TEMPLATES} onSend={sendTemplate} busy={Boolean(busy)} />}
      {tab === "email" && <Templates intro="Payment emails: price changes, receipts, trials, renewals. A promotion shows what gets ignored." list={EMAIL_TEMPLATES} onSend={sendTemplate} busy={Boolean(busy)} />}
      {tab === "type" && <form className="sbx-type" onSubmit={event => { event.preventDefault(); void sendTyped(); }}>
        <p className="sbx-note">Paste or type any SMS or email. It is read by the same AI and checks, and only kept in your sandbox.</p>
        <div className="sbx-radio" role="radiogroup" aria-label="Message type">
          {(["sms", "email"] as const).map(value => <label key={value}><input type="radio" name="sbx-channel" checked={channel === value} onChange={() => { setChannel(value); setSender(DEFAULT_SENDER[value]); }} /> {value === "sms" ? "Bank SMS" : "Email"}</label>)}
        </div>
        <label className="sbx-field">{channel === "sms" ? "Sender ID" : "From"}<input value={sender} onChange={event => setSender(event.target.value)} maxLength={80} required /></label>
        <label className="sbx-field">Message<textarea value={text} onChange={event => setText(event.target.value)} rows={6} maxLength={5000} required placeholder={channel === "sms" ? "Rs 499.00 debited from A/c XX1234 on 22-11-26 for UPI/NETFLIX. Ref 123456. -HDFC Bank" : "Subject: Your receipt\n\nAmount charged: Rs 649.00 on 22 Nov 2026…"} /></label>
        <button className="sbx-primary" type="submit" disabled={Boolean(busy) || !text.trim()}>Send to my sandbox</button>
      </form>}
      {tab === "break" && <div className="sbx-list">
        <p className="sbx-note">Each button sends a hostile message or request. A green result means Paytrace refused it, as it should.</p>
        {ATTACKS.map(attack => <button key={attack.id} type="button" className="sbx-item" disabled={Boolean(busy)} onClick={() => void sendAttack(attack)}><strong>{attack.label}</strong><span>Expected: {attack.expect}</span></button>)}
      </div>}
      {tab === "activity" && <div className="sbx-list">
        {alerts.length > 0 && <><h3>Warnings</h3>{alerts.map(alert => <div key={`a-${alert.n}-${alert.kind}`} className={`sbx-alert sbx-${alert.kind}`}><strong>{alert.title}</strong><span>{alert.detail}</span></div>)}</>}
        <h3>Messages ({log.length})</h3>
        {log.length === 0 ? <p className="sbx-note">Nothing sent yet.</p> : log.map(entry => <Result key={`log-${entry.n}`} entry={entry} compact />)}
      </div>}
    </div>
  </aside>;
}

function Templates({ intro, list, onSend, busy }: { intro: string; list: Template[]; onSend: (t: Template) => void; busy: boolean }) {
  return <div className="sbx-list">
    <p className="sbx-note">{intro}</p>
    {list.map(template => <button key={template.id} type="button" className="sbx-item" disabled={busy} onClick={() => onSend(template)}><strong>{template.label}</strong><span>{template.hint}</span></button>)}
  </div>;
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
