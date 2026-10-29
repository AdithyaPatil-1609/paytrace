/**
 * Next.js loads .env.local for the app, but the seed and the Cypher tests run
 * on plain node, so they import this first. No dependency, and no version
 * requirement on node's own --env-file flag. Variables already set (CI) win.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

try {
  const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    let value = trimmed.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // No .env.local. hasNeo4jConfig() reports this with a usable message.
}
