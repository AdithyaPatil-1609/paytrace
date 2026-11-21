/**
 * Sandboxes in memory. One per visitor, private to that visitor's cookie,
 * forgotten after two idle hours or when the server restarts. Nothing here
 * ever reaches Neo4j or another person's data.
 * Kept on globalThis so the page and the API routes share one store.
 */
import type { PaymentEvent } from "@/lib/ingestion/event";
import { SANDBOX_LIMITS } from "@/lib/payments/rules";

export type SandboxStep = { name: string; ok: boolean; detail: string };
export type SandboxLogEntry = {
  n: number;
  at: string;
  channel: "sms" | "email" | "phone";
  sender: string;
  preview: string;
  accepted: boolean;
  summary: string;
  steps: SandboxStep[];
};
export type SandboxEvent = { n: number; receivedOn: string; channel: "sms" | "email"; sender: string; text: string; event: PaymentEvent; key: string };
export type Sandbox = { id: string; created: number; touched: number; counter: number; log: SandboxLogEntry[]; events: SandboxEvent[] };

type Store = Map<string, Sandbox>;
const holder = globalThis as unknown as { __paytraceSandboxes?: Store };
const store: Store = (holder.__paytraceSandboxes ??= new Map());

function sweep(now: number) {
  for (const [id, box] of store) if (now - box.touched > SANDBOX_LIMITS.idleMs) store.delete(id);
  while (store.size > SANDBOX_LIMITS.maxSandboxes) {
    let oldest: Sandbox | undefined;
    for (const box of store.values()) if (!oldest || box.touched < oldest.touched) oldest = box;
    store.delete(oldest!.id);
  }
}

export function getSandbox(id: string, now = Date.now()) {
  const box = store.get(id);
  if (!box || now - box.touched > SANDBOX_LIMITS.idleMs) { store.delete(id); return null; }
  return box;
}

export function openSandbox(id: string, now = Date.now()) {
  const existing = getSandbox(id, now);
  if (existing) { existing.touched = now; return existing; }
  const box: Sandbox = { id, created: now, touched: now, counter: 0, log: [], events: [] };
  store.set(id, box);
  sweep(now);
  return box;
}

export function resetSandbox(id: string) {
  store.delete(id);
}

export function isFull(box: Sandbox) {
  return box.log.length >= SANDBOX_LIMITS.maxMessages;
}

/** Test helper. */
export function clearSandboxes() {
  store.clear();
}
