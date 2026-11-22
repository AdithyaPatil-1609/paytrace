/**
 * The two local model servers the assistant talks to.
 *
 * - Ollama runs qwen3:14b for Job 1 (understand the question) and Job 2
 *   (write the answer).
 * - MLX runs Qwen3 8B with the fine-tuned alert adapter for Job 3 (read a
 *   pasted bank alert): npm run ai:alerts.
 *
 * Both run on this machine. With PAYTRACE_ALLOW_LAN_MODEL=true they may run on
 * a teammate's laptop on the same private network (10.x, 192.168.x, 172.16-31.x);
 * any public address is still refused, so payment text never leaves our own machines.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OLLAMA_URL = process.env.PAYTRACE_OLLAMA_URL ?? "http://127.0.0.1:11434";
export const CHAT_MODEL = process.env.PAYTRACE_CHAT_MODEL ?? "qwen3:14b";
const ALERT_URL = process.env.PAYTRACE_ALERT_MODEL_URL ?? "http://127.0.0.1:8080";
export const ALERT_MODEL = "Qwen3 8B + Paytrace alert adapter";
const RECURRING_URL = process.env.PAYTRACE_RECURRING_MODEL_URL ?? "http://127.0.0.1:8081";
export const RECURRING_MODEL = "Qwen3 8B + Paytrace recurring adapter";

const TIMEOUT_MS = 90_000;

/** A teammate's laptop on our private network (Tailscale or a home LAN): only private addresses, and only when switched on. */
// Includes 100.64-127.x, the addresses Tailscale gives each laptop on our own encrypted network.
const PRIVATE_LAN = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/;

function local(base: string) {
  const url = new URL(base);
  const onThisMachine = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const onOurLan = process.env.PAYTRACE_ALLOW_LAN_MODEL === "true" && PRIVATE_LAN.test(url.hostname);
  if (!onThisMachine && !onOurLan) {
    throw new Error("Model servers must run on this machine or, if allowed, a laptop on the same private network.");
  }
  return url.origin;
}

/** Qwen3 can open with a thinking block; only the text after it is the answer. */
function afterThinking(text: string) {
  return text.split("</think>").pop()!.trim();
}

/** One chat turn on Ollama. Greedy decoding, no thinking, optional JSON schema. */
export async function ollamaChat(messages: ChatMessage[], format?: object, timeoutMs=TIMEOUT_MS): Promise<string> {
  const response = await fetch(`${local(OLLAMA_URL)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream: false,
      think: false,
      // Keep Qwen loaded between messages, so a live SMS is read in seconds, not after a cold start.
      keep_alive: process.env.PAYTRACE_OLLAMA_KEEP_ALIVE ?? "30m",
      options: { temperature: 0 },
      ...(format ? { format } : {})
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Ollama answered ${response.status}`);
  const body = (await response.json()) as { message?: { content?: string } };
  return afterThinking(body.message?.content ?? "");
}

/**
 * One chat turn on the MLX server with the alert adapter. Thinking is off and
 * decoding is greedy, which is how the adapter was trained and scored.
 */
export async function alertChat(messages: ChatMessage[]): Promise<string> {
  return mlxChat(ALERT_URL, messages, "Alert");
}

/** Job 4: the MLX server with the recurring adapter (npm run ai:recurring), trained and scored the same way. */
export async function recurringChat(messages: ChatMessage[]): Promise<string> {
  return mlxChat(RECURRING_URL, messages, "Recurring");
}

async function mlxChat(base: string, messages: ChatMessage[], label: string): Promise<string> {
  const response = await fetch(`${local(base)}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: 0,
      max_tokens: 200,
      chat_template_kwargs: { enable_thinking: false }
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${label} model answered ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return afterThinking(body.choices?.[0]?.message?.content ?? "");
}

/** Which models are up right now, for the status dot in the chat panel. */
export async function modelStatus() {
  const check = async (url: string, test: (body: unknown) => boolean) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      return response.ok && test(await response.json());
    } catch {
      return false;
    }
  };
  const [chat, alerts] = await Promise.all([
    check(`${local(OLLAMA_URL)}/api/tags`, (body) =>
      ((body as { models?: { name: string }[] }).models ?? []).some((model) => model.name === CHAT_MODEL)
    ),
    check(`${local(ALERT_URL)}/v1/models`, () => true)
  ]);
  return { chat, alerts, chatModel: CHAT_MODEL, alertModel: ALERT_MODEL };
}
