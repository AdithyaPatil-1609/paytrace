"use client";

/**
 * The Paytrace assistant: a button in the bottom-right corner that opens a
 * small chat panel. Questions go to /api/assistant, which runs the local Qwen
 * models and optionally retrieves shared graph guidance from Aura Agent.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Reply = {
  reply: string;
  kind: "answer" | "alert" | "blocked" | "offline" | "out_of_scope";
  payments: { id: string; name: string }[];
  model: string | null;
};

type Message = { id: number; from: "you" | "assistant"; text: string; reply?: Reply; failed?: boolean };

type Status = { chat: boolean; alerts: boolean; chatModel: string; alertModel: string; aura: boolean } | null;

const SUGGESTIONS = [
  "How much will go out next month?",
  "Why was I charged by Spotify?",
  "How do I cancel the gym?",
  "Is my YouTube autopay active?"
];

const MAX_MESSAGE = 600;

export function AssistantWidget({ scope, onOpen }: { scope: "demo" | "demo-static" | "account"; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [useAura, setUseAura] = useState(false);
  const auraAvailable = scope === "account" && status?.aura === true;
  const nextId = useRef(1);
  const input = useRef<HTMLTextAreaElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Check which models are running whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/assistant/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => alive && setStatus(body))
      .catch(() => alive && setStatus(null));
    input.current?.focus();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Only when focus is in the chat, so Esc on the payment drawer closes just the drawer.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.current?.contains(document.activeElement)) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setMessages((list) => [...list, { id: nextId.current++, from: "you", text: message }]);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, scope, useAura: auraAvailable && useAura })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The assistant could not answer.");
      const reply = body as Reply;
      setMessages((list) => [...list, { id: nextId.current++, from: "assistant", text: reply.reply, reply }]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "The assistant could not answer.";
      setMessages((list) => [...list, { id: nextId.current++, from: "assistant", text, failed: true }]);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  const online = status?.chat ?? false;
  const statusText = status === null ? "Checking the local model…" : online ? `Local ${status.chatModel}` : "Local model offline";

  return (
    <div className={`assistant${open ? " is-open" : ""}`}>
      {open && (
        <section ref={panel} className="assistant-panel" role="dialog" aria-label="Paytrace assistant" aria-modal="false">
          <header className="assistant-head">
            <div>
              <h2>Ask Paytrace</h2>
              <p className="assistant-status">
                <i className={status === null ? "" : online ? "on" : "off"} aria-hidden="true" />
                {statusText}
              </p>
            </div>
            <button className="assistant-close" onClick={close} aria-label="Close the assistant">
              ×
            </button>
          </header>

          <div className="assistant-log" ref={log} aria-live="polite" aria-busy={busy}>
            {messages.length === 0 && (
              <div className="assistant-intro">
                <p>
                  Ask about your recurring payments, or paste a bank SMS to read it. Answers come only from your
                  payment records. Your personal records and messages are processed locally.
                </p>
                <div className="assistant-suggestions">
                  {(auraAvailable ? [...SUGGESTIONS, "How do I cancel Spotify Premium?", "How do I revoke UPI AutoPay?"] : SUGGESTIONS).map((suggestion) => (
                    <button key={suggestion} onClick={() => void send(suggestion)} disabled={busy}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`assistant-msg from-${message.from}${message.reply?.kind === "blocked" ? " is-blocked" : ""}${
                  message.failed || message.reply?.kind === "offline" ? " is-failed" : ""
                }`}
              >
                <p>{message.text}</p>
                {message.reply && message.reply.payments.length > 0 && (
                  <div className="assistant-links">
                    {message.reply.payments.map((payment) => (
                      <button key={payment.id} onClick={() => onOpen(payment.id)}>
                        Open {payment.name} →
                      </button>
                    ))}
                  </div>
                )}
                {message.reply && (
                  <small>{message.reply.model === "Neo4j Aura Agent" ? "Neo4j Aura Agent · shared knowledge graph" : message.reply.model ? `Worded by ${message.reply.model}` : "Fixed reply, no model wording"}</small>
                )}
              </div>
            ))}

            {busy && (
              <div className="assistant-msg from-assistant assistant-typing" aria-label="The assistant is thinking">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {auraAvailable && (
            <label className="assistant-note">
              <input type="checkbox" checked={useAura} disabled={busy} onChange={(event) => setUseAura(event.target.checked)} />{" "}
              Use Neo4j Aura Agent for general cancellation guidance (only catalog names are sent; no personal records).
            </label>
          )}
          <form
            className="assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor="assistant-input" className="visually-hidden">
              Your question
            </label>
            <textarea
              id="assistant-input"
              ref={input}
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE}
              placeholder="Ask about a payment…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
              ↑
            </button>
          </form>
          <p className="assistant-note">Never paste an OTP or PIN. If you do, it is dropped before any model sees it.</p>
        </section>
      )}

      <button
        ref={toggle}
        className="assistant-toggle"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? "Close the assistant" : "Open the Paytrace assistant"}
      >
        {open ? (
          "×"
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M8.5 8.5h7M8.5 11.5h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Ask AI · Qwen</span>
          </>
        )}
      </button>
    </div>
  );
}
