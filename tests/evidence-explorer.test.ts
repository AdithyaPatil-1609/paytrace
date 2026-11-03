import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentEvidenceExplorer } from "../components/visualizations/payment-evidence-graph";
import { detectCommitments } from "@/lib/payments/engine";
import { loadFixtures } from "@/data/fixtures";

const dataset = loadFixtures();
const items = detectCommitments(dataset);
const homeLoan = items.find((item) => item.merchant === "Home loan")!;

test("evidence explorer limits drawn nodes while retaining every source record", () => {
  const markup = renderToStaticMarkup(createElement(PaymentEvidenceExplorer, { items: [homeLoan], dictionary: dataset.dictionary, live: true, onOpen: () => {} }));
  const expected = Math.min(7, homeLoan.evidenceRows.length) + Math.min(5, homeLoan.notices.length) + 2;
  assert.equal((markup.match(/role="button"/g) ?? []).length, expected);
  assert.match(markup, /Records from Neo4j analysis/);
  assert.ok(markup.includes(`Statement debits (${homeLoan.evidenceRows.length})`));
  for (const notice of homeLoan.notices) assert.ok(markup.includes(notice.text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;")));
});

test("offline evidence never claims live queries or invents missing mandate and merchant records", () => {
  const unknown = { ...homeLoan, inDictionary: false, mandateRef: undefined, rawNarration: "UNKNOWN-PROVIDER" };
  const markup = renderToStaticMarkup(createElement(PaymentEvidenceExplorer, { items: [unknown], dictionary: dataset.dictionary, live: false, onOpen: () => {} }));
  assert.match(markup, /not a live Neo4j query/);
  assert.doesNotMatch(markup, /payment-evidence-node evidence-node-mandate/);
  assert.doesNotMatch(markup, /payment-evidence-node evidence-node-pattern/);
  assert.match(markup, /No matching merchant pattern found/);
});

test("empty evidence data produces an explicit empty state", () => {
  const markup = renderToStaticMarkup(createElement(PaymentEvidenceExplorer, { items: [], dictionary: [], live: false, onOpen: () => {} }));
  assert.match(markup, /No recurring payments are available/);
});

test("graph markup stays identical across small server/browser trigonometry differences", () => {
  const render = () => renderToStaticMarkup(createElement(PaymentEvidenceExplorer, { items: [homeLoan], dictionary: dataset.dictionary, live: true, onOpen: () => {} }));
  const server = render();
  const originalSin = Math.sin;
  const originalCos = Math.cos;
  let browser: string;
  try {
    Math.sin = (angle) => originalSin(angle) + 1e-14;
    Math.cos = (angle) => originalCos(angle) - 1e-14;
    browser = render();
  } finally {
    Math.sin = originalSin;
    Math.cos = originalCos;
  }
  assert.equal(browser, server);
  for (const match of server.matchAll(/\b(?:x|y|cx|cy|x1|x2|y1|y2)="(-?\d+(?:\.\d+)?)"/g)) {
    assert.ok((match[1].split(".")[1]?.length ?? 0) <= 3, `Unstable coordinate: ${match[1]}`);
  }
});
