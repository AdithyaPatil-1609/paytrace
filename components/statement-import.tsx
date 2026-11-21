"use client";
/**
 * Account menu section: import a bank statement as CSV. The file is read in the
 * browser, sent once, and only its debit lines' date, amount and description
 * are stored, with account numbers removed.
 */
import { useState } from "react";
import { STATEMENT_LIMITS } from "@/lib/statements/csv";

export function StatementImport({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > STATEMENT_LIMITS.maxBytes) { setMessage({ text: `The file is larger than ${STATEMENT_LIMITS.maxBytes / 1024} KB. Export a shorter period, such as 12 months.`, error: true }); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/account/statement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, csv: await file.text() }) });
      if (response.status === 401) { window.location.replace("/account?notice=session-expired"); return; }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage({ text: typeof body.error === "string" ? body.error : "The statement could not be imported.", error: true }); return; }
      setMessage({ text: `Importing ${body.debits} payments from ${body.from} to ${body.to}${body.skipped ? ` (${body.skipped} rows skipped)` : ""}. They appear here over the next minute.`, error: false });
      onImported();
    } catch {
      setMessage({ text: "The statement could not be uploaded. Try again.", error: true });
    } finally { setBusy(false); }
  }

  return <>
    <p className="account-eyebrow">DATA CONNECTION · BANK STATEMENT</p>
    <p className="account-note">Import a statement from net banking as CSV (or an Excel file saved as CSV). Only each debit&apos;s date, amount and description are kept; account numbers are removed and the file itself is not stored.</p>
    <label className="account-button statement-upload">{busy ? "Importing…" : "Import statement (CSV)"}
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
    {message && <p className="account-note" role={message.error ? "alert" : "status"}>{message.text}</p>}
  </>;
}
