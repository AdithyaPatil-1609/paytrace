/**
 * The per-person rate limiter (plan card S2) and the routes it guards.
 * Times are passed in, so nothing here waits.
 */
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { clientKey, LIMITS, resetRateLimits, takeHit, tooMany } from "../server/security/rate-limit";
import { POST as ask } from "../web/app/api/assistant/route";

beforeEach(() => resetRateLimits());

test("a window allows its limit, refuses the next hit, and opens again later", () => {
  const windows = [{ limit: 2, ms: 1000 }];
  assert.equal(takeHit("r", "a", windows, 0).ok, true);
  assert.equal(takeHit("r", "a", windows, 10).ok, true);
  const refused = takeHit("r", "a", windows, 20);
  assert.deepEqual(refused, { ok: false, retryAfter: 1 });
  assert.equal(takeHit("r", "a", windows, 1001).ok, true, "the first hit has left the window");
});

test("people and routes are counted separately", () => {
  const windows = [{ limit: 1, ms: 1000 }];
  assert.equal(takeHit("r", "a", windows, 0).ok, true);
  assert.equal(takeHit("r", "b", windows, 0).ok, true);
  assert.equal(takeHit("other", "a", windows, 0).ok, true);
  assert.equal(takeHit("r", "a", windows, 0).ok, false);
});

test("the hourly window still applies when the minute window is free", () => {
  const windows = [
    { limit: 5, ms: 60_000 },
    { limit: 6, ms: 3_600_000 }
  ];
  for (let i = 0; i < 6; i++) assert.equal(takeHit("r", "a", windows, i * 61_000).ok, true);
  assert.equal(takeHit("r", "a", windows, 7 * 61_000).ok, false);
});

test("the visitor comes from Cloudflare's header, then the proxy header", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  assert.equal(clientKey(request({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "10.0.0.1" })), "203.0.113.5");
  assert.equal(clientKey(request({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })), "198.51.100.7");
  assert.equal(clientKey(request({})), "local");
});

test("a refused request gets 429 with Retry-After", async () => {
  const response = tooMany(12);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
});

test("Ask AI refuses the seventh question in a minute from one person", async () => {
  const send = () =>
    ask(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.20" },
        body: "{}"
      }) as never
    );
  for (let i = 0; i < LIMITS.assistant[0].limit; i++) assert.equal((await send()).status, 400, "empty question");
  assert.equal((await send()).status, 429);
});

test("Gmail sync refuses the sixth request in a minute from one address, before any session check", async () => {
  const { POST: sync } = await import("../web/app/api/account/gmail/sync/route");
  const { NextRequest } = await import("next/server");
  const send = () => sync(new NextRequest("http://localhost:3000/api/account/gmail/sync", { method: "POST", headers: { origin: "http://localhost:3000", "cf-connecting-ip": "203.0.113.30" } }));
  for (let i = 0; i < LIMITS.gmailSync[0].limit; i++) assert.notEqual((await send()).status, 429);
  assert.equal((await send()).status, 429);
});
