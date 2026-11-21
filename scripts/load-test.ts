/**
 * Short load test (plan card S11). Sends a steady stream of requests for a
 * fixed time and reports response times and status codes, so we can show the
 * request limits work and the server stays up.
 *
 *   npx tsx scripts/load-test.ts http://127.0.0.1:3000/ 50 60
 *   npx tsx scripts/load-test.ts http://127.0.0.1:3000/api/ingest/sms 50 30 post
 *
 * Arguments: URL, requests per second, seconds, and "post" to send a made-up
 * unsigned SMS body (it must be refused with 401 or 429, never accepted).
 * Only run it against our own server.
 */
const [url = "http://127.0.0.1:3000/", rateArg = "50", secondsArg = "60", mode = "get"] = process.argv.slice(2);
const rate = Math.min(Number(rateArg), 500), seconds = Math.min(Number(secondsArg), 300);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url) && !process.env.LOAD_TEST_ALLOW_REMOTE) {
  console.error("Refusing to load-test a remote address. Set LOAD_TEST_ALLOW_REMOTE=1 for our own domain.");
  process.exit(2);
}

const body = JSON.stringify({ sender: "AX-TESTBK-S", text: "Rs 1 debited for LOADTEST", receivedAt: new Date().toISOString() });
const times: number[] = [];
const codes = new Map<string, number>();

async function one() {
  const start = performance.now();
  let code = "error";
  try {
    const response = await fetch(url, mode === "post"
      ? { method: "POST", body, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000) }
      : { signal: AbortSignal.timeout(15_000) });
    await response.arrayBuffer();
    code = String(response.status);
  } catch { /* counted as error */ }
  times.push(performance.now() - start);
  codes.set(code, (codes.get(code) ?? 0) + 1);
}

async function main() {
  const pending: Promise<void>[] = [];
  const total = rate * seconds, gap = 1000 / rate, began = performance.now();
  for (let i = 0; i < total; i++) {
    const due = began + i * gap - performance.now();
    if (due > 0) await new Promise(r => setTimeout(r, due));
    pending.push(one());
  }
  await Promise.all(pending);
  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
  console.log(`${url} · ${mode.toUpperCase()} · ${rate}/s for ${seconds}s · ${times.length} requests`);
  console.log(`response time ms: p50 ${pct(50)} · p95 ${pct(95)} · p99 ${pct(99)} · max ${times.at(-1)!.toFixed(0)}`);
  console.log("status codes:", Object.fromEntries([...codes].sort()));
}
void main();
export {};
