"use client";
/**
 * "Connect iPhone" under Add phone in the top bar (plan card U4). iOS lets no app read
 * SMS, so the person sets up a Shortcut automation that posts each bank SMS
 * with a personal token. The token is shown once here and never again.
 */
import { useState } from "react";

const ENDPOINT = "https://paytrace.co.in/api/ingest/ios";
const WORDS = ["debited", "mandate", "autopay"];

export function IphoneConnect({ connected, onChange }: { connected: boolean; onChange: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function call(action?: "disconnect") {
    if (action === "disconnect" && !window.confirm("Disconnect your iPhone? Its Shortcut will stop working.")) return;
    if (!action && connected && !window.confirm("Make a new token? The Shortcut on your iPhone stops working until you paste the new one.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/iphone${action ? "?action=disconnect" : ""}`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error);
      setToken(result.token ?? "");
      onChange();
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "Could not reach Paytrace. Retry.");
    } finally { setBusy(false); }
  }

  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); } catch { setCopied(""); }
  }

  return <>
    <p className="account-eyebrow">DATA CONNECTION · IPHONE SMS</p>
    {!token && <p className="account-note">{connected
      ? "Connected · your Shortcut sends bank SMS to this account."
      : "Optional: an iPhone Shortcut sends each bank SMS about a debit, mandate or autopay to this account. OTP messages are dropped before they are read, and the SMS text is not stored."}</p>}
    {token ? <div className="iphone-setup">
      <p className="account-note"><strong>Your personal token.</strong> It is shown only now. Anyone with it can send messages to your account, so do not share it.</p>
      <code className="iphone-token">{token}</code>
      <button className="account-button primary" type="button" onClick={() => void copy("token", `Bearer ${token}`)}>{copied === "token" ? "Copied" : "Copy “Bearer …” for the Shortcut"}</button>
      <p className="account-eyebrow">SET UP THE SHORTCUT ON YOUR IPHONE</p>
      <ol className="iphone-steps">
        <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong> → <strong>+</strong> → <strong>Message</strong>.</li>
        <li>Tap <strong>Message Contains</strong>, type <strong>{WORDS[0]}</strong>. Choose <strong>Run Immediately</strong>, then <strong>Next</strong> → <strong>New Blank Automation</strong>.</li>
        <li>Add <strong>Get Contents of URL</strong>. URL: <code>{ENDPOINT}</code> <button className="link-button" type="button" onClick={() => void copy("url", ENDPOINT)}>{copied === "url" ? "copied" : "copy"}</button></li>
        <li>Tap <strong>›</strong>: Method <strong>POST</strong>. Under Headers add <code>Authorization</code> and paste the copied <code>Bearer …</code> value.</li>
        <li>Request Body <strong>JSON</strong>. Add text field <code>sender</code> = <strong>Shortcut Input → Sender</strong>, and text field <code>text</code> = <strong>Shortcut Input → Content</strong>.</li>
        <li>Tap <strong>Done</strong>. Repeat steps 1–5 for <strong>{WORDS[1]}</strong> and <strong>{WORDS[2]}</strong>, or duplicate the automation and change the word.</li>
        <li>The next bank SMS appears here within a minute.</li>
      </ol>
      <button className="account-button" type="button" onClick={() => setToken("")}>I have saved it</button>
    </div> : <button className="account-button primary" type="button" disabled={busy} onClick={() => void call()}>{connected ? "Make a new token" : "Connect iPhone"}</button>}
    {connected && !token && <button className="account-button danger" type="button" disabled={busy} onClick={() => void call("disconnect")}>Disconnect iPhone</button>}
    {error && <p className="account-note" role="alert">{error}</p>}
  </>;
}
