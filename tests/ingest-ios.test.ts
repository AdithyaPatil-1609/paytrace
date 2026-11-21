/**
 * POST /api/ingest/ios (plan card U4): the iPhone Shortcut path. The checks
 * that run before Neo4j are tested here; the token lookup is in
 * tests/cypher/account-isolation.test.ts. Every message is made up.
 */
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { GET, POST } from "../app/api/ingest/ios/route";
import { bearerToken, checkShortcutBody, IOS_TOKEN, newIosToken } from "../lib/ingestion/ios-token";
import { resetRateLimits } from "../lib/security/rate-limit";

const URL = "http://localhost/api/ingest/ios";
const NOW = Date.parse("2026-11-21T12:00:00.000Z");
const TEXT = "Rs 649.00 debited from A/c XX4417 on 21-11-26 for UPI Autopay DEMOFLIX. UPI Ref 633012345678";

const send = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request(URL, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body }));

beforeEach(() => resetRateLimits());

test("a new iPhone token has the fixed shape and is never repeated", () => {
  const a = newIosToken(), b = newIosToken();
  assert.match(a, IOS_TOKEN);
  assert.notEqual(a, b);
});

test("the token is read despite small typing slips, but must itself be exact", () => {
  const token = newIosToken();
  const read = (value?: string) => bearerToken(new Request(URL, { headers: value ? { authorization: value } : {} }));
  for (const value of [`Bearer ${token}`, `bearer ${token}`, `Bearer${token}`, `  Bearer   ${token}  `, token, `"Bearer ${token}"`]) {
    assert.equal(read(value), token, JSON.stringify(value));
  }
  assert.equal(read("Bearer pt_ios_short"), null);
  assert.equal(read(`Bearer ${token}x`), null);
  assert.equal(read(`Bearer ${token.slice(0, -1)}`), null);
  assert.equal(read(`Bearer ${"pt_and_" + token.slice(7)}`), null);
  assert.equal(read(undefined), null);
});

test("ingest/ios refuses a missing or malformed token before touching storage", async () => {
  const body = JSON.stringify({ sender: "VM-HDFCBK", text: TEXT });
  const missing = await send(body);
  assert.equal(missing.status, 401);
  assert.match((await missing.json()).error, /No Authorization header/);
  assert.equal((await send(body, { authorization: "Bearer not-a-token" })).status, 401);
  assert.equal((await send(body, { "x-paytrace-device": "anything" })).status, 401);
});

test("ingest/ios refuses a large body before reading the token", async () => {
  assert.equal((await send("x", { "content-length": "5000" })).status, 413);
});

test("ingest/ios answers a browser visit with a clear 405", async () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.match((await response.json()).error, /set Method to POST/);
});

test("the Shortcut body accepts an iPhone bank sender with or without the -S ending", () => {
  for (const sender of ["VM-HDFCBK", "vm-hdfcbk-s", "JD-ICICIT-T"]) {
    const checked = checkShortcutBody({ sender, text: TEXT }, NOW);
    assert.ok(checked.ok, sender);
    if (checked.ok) {
      assert.equal(checked.message.sender, sender.toUpperCase());
      assert.equal(checked.message.receivedAt, new Date(NOW).toISOString());
    }
  }
});

test("the Shortcut body refuses phone numbers, contact names and extra fields", () => {
  for (const sender of ["+919812345678", "9812345678", "Mum", "HDFCBK", "VM-HDFCBK-P"]) {
    assert.equal(checkShortcutBody({ sender, text: TEXT }, NOW).ok, false, sender);
  }
  assert.equal(checkShortcutBody({ sender: "VM-HDFCBK", text: TEXT, profile: "someone-else" }, NOW).ok, false);
  assert.equal(checkShortcutBody({ sender: "VM-HDFCBK", text: "" }, NOW).ok, false);
  assert.equal(checkShortcutBody({ sender: "VM-HDFCBK", text: "x".repeat(2001) }, NOW).ok, false);
  assert.equal(checkShortcutBody([], NOW).ok, false);
});

test("the Shortcut body keeps a given time inside the window and refuses one outside", () => {
  const given = checkShortcutBody({ sender: "VM-HDFCBK", text: TEXT, receivedAt: "2026-11-21T11:59:00Z" }, NOW);
  assert.ok(given.ok && given.message.receivedAt === "2026-11-21T11:59:00.000Z");
  assert.equal(checkShortcutBody({ sender: "VM-HDFCBK", text: TEXT, receivedAt: "2026-10-01T00:00:00Z" }, NOW).ok, false);
  assert.equal(checkShortcutBody({ sender: "VM-HDFCBK", text: TEXT, receivedAt: "yesterday" }, NOW).ok, false);
});

test("the account menu offers Connect iPhone, and Disconnect once connected", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { IphoneConnect } = await import("../components/iphone-connect");
  const { AccountDashboard } = await import("../components/account-dashboard");
  const menu = renderToStaticMarkup(createElement(AccountDashboard, { name: "User", email: "user@example.com", linked: false, lastSync: null, asOf: "2026-11-21" }));
  assert.ok(menu.includes("DATA CONNECTION · IPHONE SMS"));
  assert.ok(menu.includes("Connect iPhone"));
  const connected = renderToStaticMarkup(createElement(IphoneConnect, { connected: true, onChange: () => {} }));
  assert.ok(connected.includes("Disconnect iPhone"));
  assert.ok(connected.includes("Make a new token"));
  assert.ok(!connected.includes("pt_ios_"), "a stored token is never shown again");
});
