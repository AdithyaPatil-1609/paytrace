/**
 * The two-account test (plan card S10), automated. Sign in as person A and
 * person B in two browsers, copy each browser's paytrace_session cookie value,
 * and run:
 *
 *   SESSION_A=... SESSION_B=... BASE_URL=https://paytrace.co.in npx tsx scripts/two-account-check.ts
 *
 * It collects every id in A's answers, then checks that none of them appear
 * in B's answers, that B cannot write to A's records with them, and that
 * requests with no session or from another website are refused.
 * Prints PASS or FAIL per check; never prints the cookies or any record.
 */
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ORIGIN = process.env.APP_ORIGIN ?? new URL(BASE).origin;
const A = process.env.SESSION_A, B = process.env.SESSION_B;
if (!A || !B) { console.error("Set SESSION_A and SESSION_B (the paytrace_session cookie of two signed-in people)."); process.exit(2); }

type Result = { check: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (check: string, ok: boolean, detail: string) => results.push({ check, ok, detail });

async function call(path: string, session?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (session) headers.set("cookie", `paytrace_session=${session}`);
  const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const text = await response.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, text };
}

/** Every value of a field named like an id, anywhere in the answer. */
function ids(value: unknown, found = new Set<string>()) {
  if (Array.isArray(value)) value.forEach(item => ids(item, found));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (/(^id$|Id$|^txnId$)/.test(key) && typeof inner === "string" && inner.length >= 6) found.add(inner);
      ids(inner, found);
    }
  }
  return found;
}

async function main() {
  const none = await call("/api/account/summary");
  record("No session gets nothing", none.status === 401, `status ${none.status}`);

  const a = await call("/api/account/summary", A), b = await call("/api/account/summary", B);
  record("Both sessions are valid", a.status === 200 && b.status === 200, `A ${a.status}, B ${b.status}`);
  const aw = await call("/api/account/warnings", A), bw = await call("/api/account/warnings", B);

  const aIds = new Set([...ids(a.body), ...ids(aw.body)]);
  const bText = `${b.text}\n${bw.text}`;
  const leaked = [...aIds].filter(id => bText.includes(id));
  record("None of A's ids appear in B's data", leaked.length === 0, `${aIds.size} ids from A checked, ${leaked.length} found in B's answers`);

  // B tries to write to A's subscriptions using A's ids.
  const subscriptionIds = [...aIds].slice(0, 20);
  let accepted = 0;
  for (const subscriptionId of subscriptionIds) {
    const r = await call("/api/account/subscription", B, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ subscriptionId, usedOn: "2026-11-01" }) });
    if (r.status === 200) accepted++;
  }
  record("B cannot change A's records with A's ids", accepted === 0, `${subscriptionIds.length} attempts, ${accepted} accepted`);

  const csrf = await call("/api/account/subscription", A, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ subscriptionId: "x".repeat(10), usedOn: "2026-11-01" }) });
  record("Another website cannot act with A's cookie", csrf.status === 403, `status ${csrf.status}`);

  const forged = await call("/api/account/summary", "A".repeat(43));
  record("A made-up session token is refused", forged.status === 401, `status ${forged.status}`);

  const width = Math.max(...results.map(r => r.check.length));
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(width)}  ${r.detail}`);
  process.exitCode = results.every(r => r.ok) ? 0 : 1;
}
main().catch(() => { console.error("Could not reach the server. Check BASE_URL."); process.exitCode = 2; });
export {};
