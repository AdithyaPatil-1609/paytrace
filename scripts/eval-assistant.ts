/**
 * Job 2 eval: the whole assistant, end to end, on the demo payments.
 *
 *   npm run ai:eval            (needs: ollama serve, with qwen3:14b pulled)
 *
 * For each question in ai/training/data/assistant_test.jsonl it checks:
 *   - routed:   Job 1 picked the expected intent;
 *   - facts:    the reply carries every key fact (amount or word) expected;
 *   - worded:   Qwen's wording passed the number check and was used
 *               (rows marked "fixed" must use the app's own sentence instead);
 *   - found:    a payment that does not exist is reported as not found.
 * Every reply is written out in full so a person can read them for meaning,
 * which no automatic check covers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadFixtures } from "../data/fixtures";
import { detectCommitments } from "../server/payments/engine";
import { ask } from "../ai/assistant/assistant";
import { CHAT_MODEL } from "../ai/assistant/models";
import {
  ANSWER_PROMPT_VERSION,
  INTENT_PROMPT_VERSION,
} from "../ai/assistant/prompts";

type Case = {
  tag: string;
  q: string;
  intent: string;
  must: string[];
  fixed?: boolean;
  found?: boolean;
};

const TEST_FILE = "ai/training/data/assistant_test.jsonl";
const cases: Case[] = readFileSync(TEST_FILE, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const dataset = loadFixtures();
const items = detectCommitments(dataset);
const NOT_FOUND =
  /could not find|couldn't find|can't find|cannot find|not find|no payment|don't see|do not see/i;
const digits = (text: string) => text.replace(/,/g, "");

const rows: {
  item: Case;
  reply: string;
  intent?: string;
  model: string | null;
  ms: number;
  checks: Record<string, boolean>;
}[] = [];

async function main() {
  for (const item of cases) {
    const started = Date.now();
    const result = await ask(item.q, items, dataset.asOf);
    const ms = Date.now() - started;
    if (result.kind === "offline") {
      console.error(
        "The local model is not running. Start it with: ollama serve",
      );
      process.exit(1);
    }
    const checks: Record<string, boolean> = {
      routed: (result.intent ?? "unknown") === item.intent,
      facts: item.must.every((fact) =>
        digits(result.reply).toLowerCase().includes(digits(fact).toLowerCase()),
      ),
      worded: item.fixed ? result.model === null : result.model !== null,
      ...(item.found === false ? { found: NOT_FOUND.test(result.reply) } : {}),
    };
    rows.push({
      item,
      reply: result.reply,
      intent: result.intent,
      model: result.model,
      ms,
      checks,
    });
    const ok = Object.values(checks).every(Boolean);
    console.log(
      `${ok ? "ok  " : "MISS"} ${String(ms).padStart(5)} ms  ${item.q}\n      ${result.reply}`,
    );
  }

  const count = (key: string) => {
    const relevant = rows.filter((row) => key in row.checks);
    return `${relevant.filter((row) => row.checks[key]).length}/${relevant.length}`;
  };
  const passed = rows.filter((row) =>
    Object.values(row.checks).every(Boolean),
  ).length;
  const times = rows.map((row) => row.ms).sort((a, b) => a - b);
  const tags = [...new Set(rows.map((row) => row.item.tag))].sort();
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

  const report = `# Job 2 · the whole assistant · ${CHAT_MODEL} · intent prompt ${INTENT_PROMPT_VERSION} · answer prompt ${ANSWER_PROMPT_VERSION}

Test set: \`${TEST_FILE}\`, ${rows.length} questions about the demo payments (as of ${dataset.asOf}).
Each question runs the full path: secret filter → Job 1 routing → facts worked out in code → Job 2 wording → number check.
A question passes only when every check on it passes.

| Measure | Result |
| --- | --- |
| Fully correct | **${passed}/${rows.length} (${Math.round((passed / rows.length) * 100)}%)** |
| Routed to the right intent | ${count("routed")} |
| Key facts in the reply | ${count("facts")} |
| Wording used as expected | ${count("worded")} |
| Unknown payment reported as not found | ${count("found")} |
| Median time | ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s |
| Slowest | ${(times[times.length - 1] / 1000).toFixed(1)} s |

| Category | Correct |
| --- | --- |
${tags
  .map((tag) => {
    const group = rows.filter((row) => row.item.tag === tag);
    return `| ${tag} | ${group.filter((row) => Object.values(row.checks).every(Boolean)).length}/${group.length} |`;
  })
  .join("\n")}

"Wording used" means Qwen's sentence passed the number check, so it was shown. Cancel steps, out-of-scope
questions and empty periods always use the app's own sentence by design, and are expected to.

**Read this score with care.** These 30 questions were used while building the assistant: the first run scored
22/30, and the misses led to fixes (matching by amount, partial names, a less strict sentence check). So this is
not a held-out score. A further 8 unseen questions were tried by hand; they found four more gaps, also fixed.
Expect new questions to find more. Correct wording is also checked only for numbers: a reply can still state
something the facts do not say, so the replies below were read by a person.

## Every reply

| | Question | Intent | Reply | Worded by |
| --- | --- | --- | --- | --- |
${rows
  .map((row) => {
    const failed = Object.entries(row.checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key);
    return `| ${failed.length ? `✗ ${failed.join(", ")}` : "✓"} | ${cell(row.item.q)} | ${row.intent ?? "-"} | ${cell(row.reply)} | ${row.model ?? "fixed"} |`;
  })
  .join("\n")}
`;

  const out = `ai/training/results/assistant_test_${CHAT_MODEL.replace(/:/g, "-")}_answer-${ANSWER_PROMPT_VERSION}.md`;
  writeFileSync(out, report);
  console.log(`\n${passed}/${rows.length} fully correct. Wrote ${out}`);
}

void main().then(() => process.exit(0));
