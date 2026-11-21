/**
 * Ask AI must refuse a signed-in request that comes from another website
 * (cross-site request forgery), before any model or database is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("Ask AI refuses a signed-in request from another website", async () => {
  process.env.GOOGLE_WEB_CLIENT_ID = "test-client";
  process.env.GOOGLE_WEB_CLIENT_SECRET = "test-secret";
  process.env.PAYTRACE_AUTH_KEY = "0".repeat(64);
  process.env.PAYTRACE_APP_URL = "https://paytrace.co.in/";
  const { NextRequest } = await import("next/server");
  const { POST } = await import("../app/api/assistant/route");
  const response = await POST(
    new NextRequest("https://paytrace.co.in/api/assistant", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: "paytrace_session=some-session",
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.77"
      },
      body: JSON.stringify({ message: "What do I pay for?", scope: "account" })
    })
  );
  assert.equal(response.status, 403);
});
