/**
 * Server-only bridge to Aura Agent's shared, non-personal knowledge graph.
 * No raw question, account ID, payment data, or Gmail/SMS text is sent.
 */
import { readDictionary } from "@/data/fixtures";
import { MECHANISM_GUIDANCE, projectMerchantKnowledge } from "@/db/neo4j/agent-knowledge";
import { looksLikeAlert, type AssistantReply } from "./assistant";
import { hasSecret } from "./secrets";

const env = (key: string) => process.env[key]?.trim() || "";
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const contains = (question: string, name: string) => {
  const term = normalize(name);
  return term.length >= 3 && (" " + question + " ").includes(" " + term + " ");
};

function config() {
  if (env("PAYTRACE_AURA_AGENT_ENABLED") !== "true") return null;
  const id = env("AURA_CLIENT_ID"), secret = env("AURA_CLIENT_SECRET");
  if (!id || !secret) return null;
  try {
    const endpoint = new URL(env("AURA_AGENT_ENDPOINT"));
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.neo4j.io" ||
        endpoint.username || endpoint.password || endpoint.port || endpoint.hash) return null;
    return { endpoint: endpoint.href, id, secret };
  } catch {
    return null;
  }
}

export function hasAuraConfig() {
  return config() !== null;
}

export type AuraTopic = { tool: "merchant_lookup" | "payment_mechanism_guide"; name: string; key: string };

const aliases: Record<string, string[]> = {
  upi_autopay: ["upi autopay", "upi mandate", "upi auto pay"],
  card_recurring: ["recurring card", "card autopay", "card mandate"],
  play_store: ["google play", "apple app store", "app store"],
  enach: ["enach", "e nach"],
  bbps: ["bbps", "bill autopay"],
  neft_standing: ["standing instruction", "standing transfer", "neft standing"],
  vas: ["value added service", "vas"],
  emi_ach: ["emi autopay", "loan autopay", "loan mandate"]
};

/** Recognize a general guidance question. The outgoing name always comes from
 * the static catalog, never from a substring or a model's interpretation.
 */
export function chooseAuraTopic(message: string): AuraTopic | null {
  if (hasSecret(message) || looksLikeAlert(message) || /[@₹$€£0-9]/.test(message)) return null;
  const q = normalize(message);
  if (!/^(?:how (?:do|can|should|to|does|is)|what (?:is|are)|explain|tell me (?:about|how)|cancel|revoke|stop|guide(?: me)? (?:to|on))\b/.test(q)) return null;
  if (!/\b(cancel|revoke|stop|disable|remove|manage|mandate|autopay|billing|payment|subscription|renewal|explain|what is|what are)\b/.test(q)) return null;
  if (/\b(how much|how many|total|balance|spend|spent|paid|charged|charge me|when|next month|last month|last year|due date|active|status|my account|my payments|my subscriptions|my transactions|my bill|my card|my bank|my email|my gmail|my sms|my data|history|refund|dispute|otp|pin|password|ignore|query|database)\b/.test(q)) return null;

  const merchants = new Map<string, string>();
  for (const row of projectMerchantKnowledge(readDictionary())) {
    if ([row.brand, row.product, row.pattern].some(name => contains(q, name))) merchants.set(row.brandKey, row.brand);
  }
  if (merchants.size > 1) return null;
  if (merchants.size === 1) {
    const [key, name] = [...merchants.entries()][0];
    return { tool: "merchant_lookup", name, key };
  }

  const methods = Object.entries(MECHANISM_GUIDANCE).filter(([key, method]) =>
    key !== "none" && [method.name, ...(aliases[key] || [])].some(name => contains(q, name))
  );
  if (methods.length !== 1) return null;
  const [key, method] = methods[0];
  return { tool: "payment_mechanism_guide", name: method.name, key };
}

export function auraPrompt(topic: AuraTopic) {
  return "Use the " + topic.tool + " Cypher template to retrieve general payment and cancellation guidance for " +
    topic.name + ". Use the catalog name exactly. Return only information supported by the shared graph; do not infer an individual payment channel.";
}

type Config = NonNullable<ReturnType<typeof config>>;
type Token = { value: string; expiresAt: number; id: string };
let cached: Token | undefined;
let pending: Promise<Token> | undefined;

async function getToken(cfg: Config): Promise<string> {
  if (cached?.id === cfg.id && cached.expiresAt > Date.now() + 30_000) return cached.value;
  if (!pending) {
    pending = (async () => {
      const response = await fetch("https://api.neo4j.io/oauth/token", {
        method: "POST", redirect: "error", cache: "no-store",
        headers: {
          Authorization: "Basic " + Buffer.from(cfg.id + ":" + cfg.secret).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error("Aura token unavailable");
      const body = await response.json();
      if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Invalid Aura token");
      const seconds = typeof body.expires_in === "number" && Number.isFinite(body.expires_in) ? body.expires_in : 0;
      return { value: body.access_token, expiresAt: Date.now() + Math.max(0, seconds) * 1000, id: cfg.id };
    })().finally(() => { pending = undefined; });
  }
  cached = await pending;
  return cached.value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function field(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value.trim().slice(0, 750) : "";
}

/** Require actual matching Cypher rows, not model prose claiming it used the graph. */
export function replyFromAura(payload: unknown, topic: AuraTopic): AssistantReply | null {
  const response = record(payload);
  if (!response || response.status !== "SUCCESS" || !Array.isArray(response.content)) return null;
  const uses = new Set<string>();
  const results: string[] = [];
  for (const value of response.content) {
    const part = record(value);
    if (!part) continue;
    if (part.type === "cypher_template_tool_use" && typeof part.id === "string" &&
        typeof part.name === "string" && normalize(part.name) === normalize(topic.tool)) {
      uses.add(part.id);
    }
    if (part.type !== "cypher_template_tool_result" || typeof part.tool_use_id !== "string" || !uses.has(part.tool_use_id)) continue;
    const output = record(part.output);
    if (!output || !Array.isArray(output.records)) continue;
    for (const value of output.records.slice(0, 10)) {
      const row = record(value);
      if (!row) continue;
      const guidance = field(row, "guidance"), caution = field(row, "caution");
      if (!guidance || !caution) continue;
      if (topic.tool === "merchant_lookup") {
        if (normalize(field(row, "merchant")) !== normalize(topic.name)) continue;
        const method = field(row, "billingMethod") || field(row, "possibleBillingMethod");
        if (!method) continue;
        results.push((field(row, "product") || topic.name) + " — possible billing method: " + method + ". " + guidance + " " + caution);
      } else {
        const method = field(row, "mechanism") || field(row, "name") || field(row, "paymentMechanism");
        if (normalize(method) !== normalize(topic.name) && normalize(method) !== normalize(topic.key)) continue;
        results.push(topic.name + ": " + guidance + " " + caution);
      }
    }
  }
  const unique = [...new Set(results)].slice(0, 3);
  if (!unique.length) return null;
  return {
    reply: unique.join("\n\n") + "\n\nSource: Paytrace shared knowledge graph. This is general guidance, not a diagnosis of your account. Verify the actual billing channel before changing a payment.",
    kind: "answer", payments: [], model: "Neo4j Aura Agent"
  };
}

export async function askAuraGuidance(message: string): Promise<AssistantReply | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const topic = chooseAuraTopic(message);
    if (!topic) return null;
    const token = await getToken(cfg);
    const response = await fetch(cfg.endpoint, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ input: auraPrompt(topic) }),
      signal: AbortSignal.timeout(30_000)
    });
    if (response.status === 401) cached = undefined;
    if (!response.ok) return null;
    return replyFromAura(await response.json(), topic);
  } catch {
    // Keep raw messages, credentials, and remote responses out of logs.
    return null;
  }
}
