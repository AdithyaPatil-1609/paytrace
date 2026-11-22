"use client";
/**
 * Step 4: the first sync. Starts the Gmail sync and, while it runs, reads its
 * progress every 1.5 seconds so the person can watch it happen.
 */
import { useEffect, useRef, useState } from "react";
import { accountErrorMessage } from "@/lib/accounts/errors";
import { saveStep, type SignUpAccount } from "./signup-flow";

type Progress = { scanned: number; accepted: number; estimate: number } | null;
type Phase = "starting" | "searching" | "reading" | "done" | "error";

export function SyncProgress({ account, imported }: { account: SignUpAccount; imported: boolean }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [progress, setProgress] = useState<Progress>(null);
  const [result, setResult] = useState<{ accepted: number; scanned: number } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    let stopped = false;
    const phaseRef = { current: "running" as "running" | "waiting" };
    setPhase("starting"); setError(""); setResult(null);

    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/account/sync/status", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (stopped) return;
        if (body.progress) { setProgress(body.progress); setPhase(p => p === "done" || p === "error" ? p : body.progress.estimate > 0 || body.progress.scanned > 0 ? "reading" : "searching"); }
        // Another tab may be running the sync: follow it until it ends.
        if (phaseRef.current !== "waiting") return;
        if (body.status === "ready" && body.lastSync) { setResult({ accepted: body.progress?.accepted ?? 0, scanned: body.progress?.scanned ?? 0 }); setPhase("done"); clearInterval(poll); }
        if (body.status === "error" || body.status === "reauthorize") { setError(accountErrorMessage(body.error) ?? "The sync stopped. Please retry."); setPhase("error"); clearInterval(poll); }
      } catch { /* the next poll tries again */ }
    }, 1500);

    (async () => {
      setPhase("searching");
      try {
        const response = await fetch("/api/account/gmail/sync", { method: "POST" });
        const body = await response.json().catch(() => ({}));
        if (stopped) return;
        if (response.status === 401) { window.location.assign("/signup?notice=session-expired"); return; }
        if (!response.ok) { setError(typeof body.error === "string" ? body.error : "The sync could not start. Please retry."); setPhase("error"); clearInterval(poll); return; }
        if (body.status === "busy-or-disconnected") { phaseRef.current = "waiting"; return; }
        setResult({ accepted: body.accepted ?? 0, scanned: body.scanned ?? 0 });
        setProgress({ scanned: body.scanned ?? 0, accepted: body.accepted ?? 0, estimate: body.scanned ?? 0 });
        setPhase("done");
        clearInterval(poll);
      } catch { if (!stopped) { setError("No connection. Please retry."); setPhase("error"); } }
    })();
    return () => { stopped = true; clearInterval(poll); };
  }, [attempt]);

  async function openDashboard() {
    setFinishing(true);
    const problem = await saveStep({ action: "finish" });
    if (problem) { setError(problem); setFinishing(false); return; }
    window.location.assign("/account?notice=signed-in");
  }

  const total = Math.max(progress?.estimate ?? 0, progress?.scanned ?? 0);
  const percent = phase === "done" ? 100 : total > 0 ? Math.min(99, Math.round(((progress?.scanned ?? 0) / total) * 100)) : 0;
  const line = (state: "done" | "now" | "todo", text: string) => <li className={`sync-line ${state}`}><span aria-hidden="true">{state === "done" ? "✓" : state === "now" ? "●" : "○"}</span>{text}</li>;

  return <article className="account-card signup-card">
    <p className="account-eyebrow">STEP 4 · SYNCING YOUR PAYMENTS</p>
    <h2>{phase === "done" ? "All synced." : phase === "error" ? "The sync stopped." : "Finding your recurring payments…"}</h2>
    <div className="sync-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Sync progress"><div style={{ width: `${percent}%` }} /></div>
    <p className="account-note">{percent}%{progress ? ` · ${progress.scanned} of ${total || "…"} emails read · ${progress.accepted} payments found` : ""}</p>
    <ul className="sync-lines">
      {line("done", `Gmail connected: ${account.gmailEmail ?? account.email}`)}
      {line(phase === "starting" || phase === "searching" ? "now" : "done", "Searching your mailbox for payment emails (last 90 days)")}
      {line(phase === "reading" ? "now" : phase === "done" ? "done" : "todo", progress ? `Reading payment emails: ${progress.scanned} of ${total || "…"}` : "Reading payment emails")}
      {line(phase === "done" ? "done" : "todo", phase === "done" && result ? `Built your payment graph: ${result.accepted} new payment${result.accepted === 1 ? "" : "s"} from ${result.scanned} emails` : "Building your payment graph")}
      {imported && line("done", "Bank statement imported: its payments appear on your dashboard over the next minute")}
      {account.smsConsent === "yes" && line("done", "Bank SMS: new ones appear as they arrive on your paired phone")}
    </ul>
    {error && <p className="account-warning" role="alert">{error}</p>}
    {phase === "error" && <button className="account-button demo-button" type="button" onClick={() => setAttempt(a => a + 1)}>Retry sync</button>}
    <button className="account-button primary signup-continue" type="button" onClick={openDashboard} disabled={finishing || (phase !== "done" && phase !== "error")}>
      {phase === "done" ? "Open my dashboard →" : phase === "error" ? "Skip for now and open my dashboard" : "Syncing… please keep this page open"}
    </button>
  </article>;
}
