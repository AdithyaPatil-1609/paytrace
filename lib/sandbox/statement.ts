/**
 * Loads a bank statement into a visitor's sandbox, in place of the demo
 * person's: either the generated 12-month sample or the visitor's own CSV.
 * An uploaded file is read in memory only, kept for the sandbox's two hours,
 * and never stored or logged. Account numbers are removed while reading.
 */
import { randomUUID } from "node:crypto";
import { cleanNarration, parseStatementCsv } from "@/lib/statements/csv";
import { generateStatement } from "@/lib/statements/generate";

import type { Sandbox, SandboxLogEntry, SandboxStep } from "./store";

function log(box: Sandbox, accepted: boolean, summary: string, preview: string, steps: SandboxStep[]): SandboxLogEntry {
  box.counter += 1;
  const entry: SandboxLogEntry = { n: box.counter, at: new Date().toISOString().slice(0, 10), channel: "statement", sender: "Bank statement", preview, accepted, summary, steps };
  box.log.unshift(entry);
  return entry;
}

const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Each click is a new, randomly made person: a fresh seed every time. */
export function loadSampleStatement(box: Sandbox, now = today(), seed: string = randomUUID()) {
  const sample = generateStatement(seed, now);
  box.samples = (box.samples ?? 0) + 1;
  box.statement = {
    source: "sample", name: `Sample statement #${box.samples} (12 months)`,
    lines: sample.lines.map(line => ({ ...line, narration: cleanNarration(line.narration) })),
    usage: sample.usage, notices: sample.notices, skipped: 0
  };
  box.events = [];
  return log(box, true, `Sample statement loaded: ${sample.lines.length} lines`, "Load a sample bank statement", [
    { name: "Statement", ok: true, detail: `${sample.lines.length} transactions from ${sample.from} to ${sample.to}, on a savings account and a credit card.` },
    { name: "Detection", ok: true, detail: "Recurring payments are found from the statement alone, the same way as for a real one. The five screens now show this statement instead of the demo person." }
  ]);
}

export function loadUploadedStatement(box: Sandbox, name: string, csv: string) {
  const fileName = name.replace(/[^\w .()-]/g, "").slice(0, 60) || "statement.csv";
  const parsed = parseStatementCsv(csv);
  if (!parsed.ok) return log(box, false, "Statement not read", fileName, [{ name: "Read the file", ok: false, detail: parsed.error }]);
  box.statement = { source: "upload", name: fileName, lines: parsed.lines, usage: [], notices: [], skipped: parsed.skipped };
  box.events = [];
  const debits = parsed.lines.filter(line => line.type === "DEBIT").length;
  return log(box, true, `${parsed.lines.length} statement lines read`, fileName, [
    { name: "Read the file", ok: true, detail: `Columns used: ${Object.entries(parsed.columns).map(([k, v]) => `${k} = "${v}"`).join(", ")}.` },
    { name: "Transactions", ok: true, detail: `${parsed.lines.length} read (${debits} debits), from ${parsed.lines[0].date} to ${parsed.lines.at(-1)!.date}${parsed.skipped ? `; ${parsed.skipped} rows skipped (no date, description or amount)` : ""}.` },
    { name: "Privacy", ok: true, detail: "Account numbers and long references were removed. The file is kept only in this server's memory for your sandbox's two hours, and never stored or logged." }
  ]);
}

export function clearStatement(box: Sandbox) {
  box.statement = undefined;
  box.events = [];
  return log(box, true, "Back to the demo data", "Use the demo person's statement", [{ name: "Statement", ok: true, detail: "Your statement was removed from memory." }]);
}
