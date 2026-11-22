"use client";
/**
 * Import a bank statement as CSV or PDF, from the top bar or the sign-up page.
 * The file is read in the browser (a PDF and its password never leave the
 * device); only the debit lines' date, amount and description are sent, with
 * account numbers removed, and the file itself is not stored.
 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { statementFileToCsv } from "@/server/statements/read-file";

const ACCEPT = ".csv,text/csv,.pdf,application/pdf";
type Message = { text: string; error: boolean } | null;

/** Rendered at page level: the top bar uses a backdrop blur, which would trap fixed overlays inside it. */
const toBody = (node: ReactNode) => (typeof document === "undefined" ? null : createPortal(node, document.body));

/** Shared by both entry points: reading, the PDF password prompt, the upload and its result. */
function useStatementImport(onImported: () => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [asking, setAsking] = useState<{ retry: boolean } | null>(null);
  const answer = useRef<((password: string | null) => void) | null>(null);

  const askPassword = (retry: boolean) => new Promise<string | null>((resolve) => { answer.current = resolve; setAsking({ retry }); });
  const reply = (password: string | null) => { setAsking(null); answer.current?.(password); answer.current = null; };

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage(null);
    try {
      const read = await statementFileToCsv(file, askPassword);
      if (!read.ok) { if (!read.cancelled) setMessage({ text: read.error, error: true }); return; }
      const response = await fetch("/api/account/statement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, csv: read.csv }) });
      if (response.status === 401) { window.location.replace("/account?notice=session-expired"); return; }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage({ text: typeof body.error === "string" ? body.error : "The statement could not be imported.", error: true }); return; }
      setMessage({ text: `Importing ${body.debits} payments from ${body.from} to ${body.to}${body.skipped ? ` (${body.skipped} rows skipped)` : ""}. They appear here over the next minute.`, error: false });
      onImported();
    } catch {
      setMessage({ text: "The statement could not be read or uploaded. Try again.", error: true });
    } finally { setBusy(false); }
  }

  const prompt = asking && toBody(<PasswordPrompt retry={asking.retry} onAnswer={reply}/>);
  return { busy, message, setMessage, importFile, prompt };
}

function PasswordPrompt({ retry, onAnswer }: { retry: boolean; onAnswer: (password: string | null) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (value) onAnswer(value); };
  return <div className="statement-password-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(null); }}>
    <form className="statement-password" role="dialog" aria-modal="true" aria-labelledby="statement-password-title" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") onAnswer(null); }}>
      <h2 id="statement-password-title">This PDF is password protected</h2>
      <p>Banks often lock statements with a password such as your customer ID or date of birth. It is used only in this browser to open the file and is never sent or saved.</p>
      {retry && <p role="alert" className="statement-password-error">That password did not open the PDF. Try again.</p>}
      <input type="password" autoFocus autoComplete="off" aria-label="PDF password" value={value} onChange={(event) => setValue(event.target.value)}/>
      <div className="statement-password-actions">
        <button type="button" className="link-button" onClick={() => onAnswer(null)}>Cancel</button>
        <button type="submit" className="account-button" disabled={!value}>Open PDF</button>
      </div>
    </form>
  </div>;
}

/** Sign-up page section (the dashboard uses the top bar button below). */
export function StatementImport({ onImported }: { onImported: () => void }) {
  const { busy, message, importFile, prompt } = useStatementImport(onImported);
  return <>
    <p className="account-eyebrow">DATA CONNECTION · BANK STATEMENT</p>
    <p className="account-note">Import a statement from net banking as CSV or PDF (an Excel file saved as CSV works too). Only each debit&apos;s date, amount and description are kept; account numbers are removed and the file itself is not stored.</p>
    <label className="account-button statement-upload">{busy ? "Importing…" : "Import statement (CSV or PDF)"}
      <input type="file" accept={ACCEPT} disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }}/>
    </label>
    {message && <p className="account-note" role={message.error ? "alert" : "status"}>{message.text}</p>}
    {prompt}
  </>;
}

/** Top bar button: pick a statement and see the result in a small note under the bar. */
export function StatementImportButton({ onImported }: { onImported: () => void }) {
  const { busy, message, setMessage, importFile, prompt } = useStatementImport(onImported);
  const input = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" className="bar-import" disabled={busy} onClick={() => input.current?.click()} title="Import a bank statement (CSV or PDF)">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M8 10V2m0 0L4.8 5.2M8 2l3.2 3.2M2.5 11.5v2h11v-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {busy ? "Importing…" : "Import CSV/PDF"}
    </button>
    <input ref={input} type="file" accept={ACCEPT} hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }}/>
    {message && toBody(<div className={`bar-import-note${message.error ? " is-error" : ""}`} role={message.error ? "alert" : "status"}>
      <span>{message.text}</span>
      <button type="button" className="link-button" aria-label="Dismiss" onClick={() => setMessage(null)}>×</button>
    </div>)}
    {prompt}
  </>;
}
