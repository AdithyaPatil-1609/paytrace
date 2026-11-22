"use client";
/**
 * Phone number check with a Firebase SMS code. Firebase is loaded only on
 * this step, keeps its sign-in in memory only (nothing saved in the browser),
 * and is signed out again once our server has checked the token.
 */
import { useEffect, useRef, useState } from "react";
import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { toE164 } from "@/lib/accounts/phone-number";
import { saveStep } from "./signup-flow";

export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };

let authPromise: Promise<Auth> | null = null;
function firebaseAuth(config: FirebaseWebConfig) {
  authPromise ??= (async () => {
    const { initializeApp, getApps } = await import("firebase/app");
    const { initializeAuth, inMemoryPersistence } = await import("firebase/auth");
    const app = getApps()[0] ?? initializeApp(config);
    return initializeAuth(app, { persistence: inMemoryPersistence });
  })().catch(error => { authPromise = null; throw error; });
  return authPromise;
}

function firebaseMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  if (code.includes("invalid-phone-number")) return "That phone number doesn't look right.";
  if (code.includes("too-many-requests")) return "Too many tries from this device. Please wait a few minutes.";
  if (code.includes("invalid-verification-code")) return "That code is wrong. Check the SMS and try again.";
  if (code.includes("code-expired")) return "That code has expired. Send a new one.";
  if (code.includes("quota-exceeded")) return "SMS limit reached for today. Skip this step for now.";
  if (code.includes("billing-not-enabled")) return "SMS sending is not switched on for this server yet. Skip this step for now.";
  if (code.includes("captcha")) return "The robot check failed. Reload the page and try again.";
  if (code.includes("network")) return "No connection. Please retry.";
  return "Could not send or check the code. Please retry, or skip this step.";
}

export function PhoneOtp({ config, onVerified }: { config: FirebaseWebConfig; onVerified: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  useEffect(() => () => { verifier.current?.clear(); }, []);

  async function send() {
    const number = toE164(phone);
    if (!number) { setError("Enter a 10-digit Indian mobile number, or a number starting with + and the country code."); return; }
    setBusy(true); setError("");
    try {
      const auth = await firebaseAuth(config);
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      verifier.current ??= new RecaptchaVerifier(auth, "signup-recaptcha", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, number, verifier.current);
      setSentTo(number); setCode(""); setWait(30);
    } catch (e) {
      setError(firebaseMessage(e));
      verifier.current?.clear(); verifier.current = null;
    } finally { setBusy(false); }
  }

  async function check() {
    if (!confirmation.current || !/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the SMS."); return; }
    setBusy(true); setError("");
    try {
      const credential = await confirmation.current.confirm(code);
      const idToken = await credential.user.getIdToken();
      const problem = await saveStep({ action: "phone", idToken });
      const { signOut } = await import("firebase/auth");
      await signOut(await firebaseAuth(config)).catch(() => undefined);
      if (problem) setError(problem); else onVerified();
    } catch (e) { setError(firebaseMessage(e)); }
    finally { setBusy(false); }
  }

  return <div className="signup-form">
    {!sentTo
      ? <>
          <label className="signup-field">Mobile number
            <span className="signup-phone"><span aria-hidden="true">+91</span><input inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} /></span>
          </label>
          <button className="account-button primary" type="button" onClick={send} disabled={busy || !phone.trim()}>{busy ? "Sending…" : "Send code"}</button>
        </>
      : <>
          <p className="account-note">Code sent to <strong>{sentTo.slice(0, -4).replace(/\d/g, "•")}{sentTo.slice(-4)}</strong>.</p>
          <label className="signup-field">6-digit code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button className="account-button primary" type="button" onClick={check} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
          <div className="signup-choice">
            <button className="signup-link" type="button" onClick={send} disabled={busy || wait > 0}>{wait > 0 ? `Resend code in ${wait}s` : "Resend code"}</button>
            <button className="signup-link" type="button" onClick={() => { setSentTo(null); setError(""); }}>Change number</button>
          </div>
        </>}
    <div id="signup-recaptcha" />
    {error && <p className="account-warning" role="alert">{error}</p>}
  </div>;
}
