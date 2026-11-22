/**
 * Large-text mode works only if every font size in the style sheets follows
 * --text-scale. A new fixed size would stay small when the person asks for
 * larger text, so this fails on any px or rem font size written without it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { RESTORE_TEXT_SIZE, TEXT_SIZE_KEY } from "../components/chrome/text-size-toggle";

const sheets = execFileSync("git", ["ls-files", "*.css"], { encoding: "utf8" }).split("\n").filter(Boolean);

test("every px or rem font size in the style sheets scales with --text-scale", () => {
  assert.ok(sheets.length > 10, "expected the app's style sheets");
  const fixed: string[] = [];
  for (const file of sheets) {
    const css = readFileSync(file, "utf8");
    for (const match of css.matchAll(/(?<![-\w])font(?:-size)?\s*:\s*([^;{}]*)/g)) {
      const unscaled = match[1].replace(/calc\([^()]*var\(--text-scale\)\)/g, "");
      if (/\d(px|rem)\b/.test(unscaled)) fixed.push(`${file}: ${match[0].trim()}`);
    }
  }
  assert.deepEqual(fixed, []);
});

test("large-text mode raises the scale and the saved choice is restored before paint", () => {
  const foundation = readFileSync("app/styles/foundation.css", "utf8");
  assert.match(foundation, /--text-scale:\s*1;/);
  assert.match(foundation, /:root\[data-text-size="large"\]\s*{\s*--text-scale:\s*1\.25;/);
  assert.ok(RESTORE_TEXT_SIZE.includes(TEXT_SIZE_KEY));
  assert.ok(RESTORE_TEXT_SIZE.startsWith("try{"), "a storage error must never stop the page");
});
