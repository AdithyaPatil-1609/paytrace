/**
 * The two local model servers the assistant talks to.
 *
 * - Ollama runs qwen3:14b for Job 1 (understand the question) and Job 2
 *   (write the answer).
 * - MLX runs Qwen3 8B with the fine-tuned alert adapter for Job 3 (read a
 *   pasted bank alert): npm run ai:alerts.
 *
 * Both must be on this machine. A URL that points anywhere else is refused,
 * so a payment question is never sent off the laptop.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OLLAMA_URL = process.env.PAYTRACE_OLLAMA_URL ?? "http://127.0.0.1:11434";
export const CHAT_MODEL = process.env.PAYTRACE_CHAT_MODEL ?? "qwen3:14b";
const ALERT_URL = process.env.PAYTRACE_ALERT_MODEL_URL ?? "http://127.0.0.1:8080";
export const ALERT_MODEL = "Qwen3 8B + Paytrace alert adapter";

const TIMEOUT_MS = 90_000;

function local(base: string) {
  const url = new URL(base);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Model servers must run on this machine.");
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
  const response = await fetch(`${local(ALERT_URL)}/v1/chat/completions`, {
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
  if (!response.ok) throw new Error(`Alert model answered ${response.status}`);
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
