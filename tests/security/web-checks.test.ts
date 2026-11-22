/**
 * Web checks (plan card S3): cross-site requests refused on the browser POST
 * routes, bodies size-limited before parsing, and the security headers set.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fromOurSite } from "../../server/security/origin";
import { readJsonBody } from "../../server/security/body";
import nextConfig from "../../web/next.config";

const ORIGIN = "https://paytrace.co.in";
function withAccounts<T>(work: () => T) {
  const saved = { ...process.env };
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "id", GOOGLE_WEB_CLIENT_SECRET: "secret", PAYTRACE_AUTH_KEY: "a".repeat(64), PAYTRACE_APP_URL: ORIGIN + "/" });
  try { return work(); } finally { process.env = saved; }
}
const post = (headers: Record<string, string>) => new Request("http://127.0.0.1:3000/api/assistant", { method: "POST", headers });

test("requests from another website are refused", () => withAccounts(() => {
  assert.equal(fromOurSite(post({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(fromOurSite(post({ origin: "https://evil.example" })), false);
  assert.equal(fromOurSite(post({ "sec-fetch-site": "same-site" })), false);
  assert.equal(fromOurSite(post({ origin: "null" })), false);
}));

test("requests from our own pages are allowed", () => withAccounts(() => {
  assert.equal(fromOurSite(post({ origin: ORIGIN, "sec-fetch-site": "same-origin" })), true);
  assert.equal(fromOurSite(post({ origin: ORIGIN })), true);
}));

test("without account settings (local demo) the origin must match the host", () => {
  const saved = process.env.PAYTRACE_APP_URL; delete process.env.PAYTRACE_APP_URL;
  try {
    assert.equal(fromOurSite(new Request("http://localhost:3000/api/simulate", { method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" } })), true);
    assert.equal(fromOurSite(new Request("http://localhost:3000/api/simulate", { method: "POST", headers: { origin: "http://evil.example", host: "localhost:3000" } })), false);
  } finally { if (saved) process.env.PAYTRACE_APP_URL = saved; }
});

test("large or broken bodies are refused before parsing", async () => {
  const big = "x".repeat(5000);
  assert.deepEqual(await readJsonBody(new Request("http://x/", { method: "POST", body: big, headers: { "content-length": "5000" } }), 4096), { ok: false, status: 413, error: "Request too large" });
  // A client that lies about Content-Length is still caught after reading.
  const lying = await readJsonBody(new Request("http://x/", { method: "POST", body: JSON.stringify({ a: big }), headers: { "content-length": "10" } }), 4096);
  assert.equal(lying.ok, false);
  const broken = await readJsonBody(new Request("http://x/", { method: "POST", body: "{not json" }), 4096);
  assert.deepEqual(broken, { ok: false, status: 400, error: "Send valid JSON" });
  const good = await readJsonBody(new Request("http://x/", { method: "POST", body: '{"message":"hi"}' }), 4096);
  assert.deepEqual(good, { ok: true, value: { message: "hi" } });
});

test("every page gets the security headers, and API answers are never cached", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find(rule => rule.source === "/:path*")!.headers;
  const get = (key: string) => all.find(h => h.key === key)?.value ?? "";
  const csp = get("Content-Security-Policy");
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self' https://accounts.google.com"]) assert.ok(csp.includes(directive), directive);
  assert.match(get("Strict-Transport-Security"), /max-age=\d{8}/);
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.ok(get("Referrer-Policy"));
  assert.ok(get("Permissions-Policy").includes("camera=()"));
  const api = rules.find(rule => rule.source === "/api/:path*")!.headers;
  assert.ok(api.some(h => h.key === "Cache-Control" && h.value.includes("no-store")));
  assert.equal(nextConfig.poweredByHeader, false);
});
