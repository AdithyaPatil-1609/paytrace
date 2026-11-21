import assert from "node:assert/strict";
import test from "node:test";
import { askAuraGuidance, auraPrompt, chooseAuraTopic, hasAuraConfig, replyFromAura } from "../lib/assistant/aura";

test("catalog queries canonicalize merchant and mechanism names", () => {
  const merchant = chooseAuraTopic("How do I cancel Spotify Premium?");
  assert.deepEqual(merchant, { tool: "merchant_lookup", name: "Spotify", key: "spotify" });
  assert.ok(merchant);
  assert.match(auraPrompt(merchant), /for Spotify\./);
  assert.doesNotMatch(auraPrompt(merchant), /Spotify Premium/);
  assert.deepEqual(chooseAuraTopic("How do I revoke UPI AutoPay?"), {
    tool: "payment_mechanism_guide", name: "UPI AutoPay", key: "upi_autopay"
  });
});

test("personal, alert, secret, ambiguous and unsupported questions stay local", () => {
  for (const q of [
    "How much have I spent on Spotify?", "Is my Spotify active?",
    "How do I cancel Spotify and Netflix?", "How do I cancel Spotify for user@example.com?",
    "How do I cancel Spotify? OTP 123456", "Rs 499 debited for Spotify autopay",
    "How do I cancel an unknown merchant?", "How much is my next Spotify payment?"
  ]) assert.equal(chooseAuraTopic(q), null, q);
});

test("Aura reply requires the matching Cypher tool and actual catalog records", () => {
  const topic = chooseAuraTopic("How do I cancel Spotify Premium?");
  assert.ok(topic);
  const use = { type: "cypher_template_tool_use", id: "tool1", name: "merchant_lookup" };
  const row = { merchant: "Spotify", product: "Spotify Premium", billingMethod: "Recurring card payment", guidance: "Cancel renewal through the merchant.", caution: "Verify payment channel." };
  const result = { type: "cypher_template_tool_result", tool_use_id: "tool1", output: { records: [row] } };
  const parse = (content: unknown[]) => replyFromAura({ status: "SUCCESS", content }, topic);
  assert.equal(parse([{ type: "text", text: "I used the graph." }]), null);
  assert.equal(parse([use, { ...result, output: { records: null } }]), null);
  assert.equal(parse([{ ...use, name: "other_tool" }, result]), null);
  assert.equal(parse([use, { ...result, output: { records: [{ ...row, merchant: "Netflix" }] } }]), null);
  const reply = parse([use, result, { type: "text", text: "Your account is active." }]);
  assert.equal(reply?.model, "Neo4j Aura Agent");
  assert.match(reply?.reply ?? "", /possible billing method: Recurring card payment/);
  assert.doesNotMatch(reply?.reply ?? "", /Your account is active/);
  assert.deepEqual(reply?.payments, []);
});

test("disabled feature never invokes fetch", async () => {
  const previous = process.env.PAYTRACE_AURA_AGENT_ENABLED;
  const original = globalThis.fetch;
  let calls = 0;
  try {
    process.env.PAYTRACE_AURA_AGENT_ENABLED = "false";
    globalThis.fetch = async () => { calls += 1; throw new Error("Unexpected network request"); };
    assert.equal(hasAuraConfig(), false);
    assert.equal(await askAuraGuidance("How do I cancel Spotify?"), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.PAYTRACE_AURA_AGENT_ENABLED;
    else process.env.PAYTRACE_AURA_AGENT_ENABLED = previous;
  }
});

test("enabled feature sends only fixed catalog prompt, caches token and rejects non-Aura endpoints", async () => {
  const keys = ["PAYTRACE_AURA_AGENT_ENABLED", "AURA_AGENT_ENDPOINT", "AURA_CLIENT_ID", "AURA_CLIENT_SECRET"];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    Object.assign(process.env, {
      PAYTRACE_AURA_AGENT_ENABLED: "true", AURA_AGENT_ENDPOINT: "https://api.neo4j.io/test",
      AURA_CLIENT_ID: "test-client", AURA_CLIENT_SECRET: "test-secret"
    });
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(String(input).endsWith("/oauth/token")
        ? { access_token: "test-token", expires_in: 3600 }
        : {
          status: "SUCCESS", content: [
            { type: "cypher_template_tool_use", id: "tool2", name: "payment_mechanism_guide" },
            { type: "cypher_template_tool_result", tool_use_id: "tool2",
              output: { records: [{ mechanism: "UPI AutoPay", guidance: "Check the UPI app.", caution: "Verify obligations." }] } }
          ]
        });
    };
    assert.equal(hasAuraConfig(), true);
    const result = await askAuraGuidance("How do I revoke UPI AutoPay?");
    assert.equal(result?.model, "Neo4j Aura Agent");
    assert.match(result?.reply ?? "", /Check the UPI app/);
    assert.equal(calls.length, 2);
    const topic = chooseAuraTopic("How do I revoke UPI AutoPay?");
    assert.ok(topic);
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { input: auraPrompt(topic) });
    assert.equal(new Headers(calls[1].init?.headers).get("Authorization"), "Bearer test-token");
    await askAuraGuidance("How do I revoke UPI AutoPay?");
    assert.equal(calls.length, 3);
    process.env.AURA_AGENT_ENDPOINT = "https://example.com/agent";
    assert.equal(hasAuraConfig(), false);
    assert.equal(await askAuraGuidance("How do I revoke UPI AutoPay?"), null);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
