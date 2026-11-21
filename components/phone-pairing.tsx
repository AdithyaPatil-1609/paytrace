"use client";
/**
 * Account menu section for the Paytrace phone app: shows a one-time pairing
 * code (10 minutes, single use) and a way to unpair every phone.
 */
import { useState } from "react";

export function PhonePairing() {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function newCode() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/devices/pairing-code", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not create a code");
      setCode(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a code");
    } finally { setBusy(false); }
  }

  return <>
    <p className="account-eyebrow">DATA CONNECTION · PHONE</p>
    <p className="account-note">Pair the Paytrace Android app to send your bank SMS. Each phone signs its messages with its own key; one-time passwords never leave the phone.</p>
    {code
      ? <p className="account-note" role="status">Enter this code in the phone app: <strong className="pairing-code">{code.code.slice(0, 4)}-{code.code.slice(4)}</strong><br/>Works once, until {new Date(code.expiresAt).toLocaleTimeString()}.</p>
      : null}
    {error && <p className="account-note" role="alert">{error}</p>}
    <button className="account-button primary" type="button" disabled={busy} onClick={() => void newCode()}>{busy ? "Creating code…" : code ? "New pairing code" : "Pair a phone"}</button>
    <form action="/api/devices/remove" method="post"><button className="account-button danger" type="submit">Remove all paired phones</button></form>
  </>;
}
