// Checks that each graph query's rows are drawn as the right nodes and relationships.
// Made-up merchants and records only.
import assert from "node:assert/strict";
import test from "node:test";
import { corroboratedGraph, GRAPH_LIMITS, layoutGraph, LAYOUT, recordsGraph, shorten, similarGraph, trustGraph } from "../server/presentation/query-graph";
import type { Evidence } from "../neo4j/warnings";
import type { SimilarLink } from "../neo4j/merchant-links";

const ev = (id: string, source = "sms", sourceTrust: Evidence["sourceTrust"] = "authenticated_source"): Evidence =>
  ({ id, source, kind: "debit_alert", date: "2026-10-05", sourceTrust, trustReason: "test" });
const link = (a: string, b: string, status: SimilarLink["status"], score = 0.82): SimilarLink => ({
  a: { id: a, name: `Shop ${a}`, payments: 2 }, b: { id: b, name: `Shop ${b}`, payments: 1 },
  score, method: "word_containment", reason: "Names share a word.", band: "review", status, detectedAt: null, decidedAt: null, algorithmVersion: "merchant-match-v1"
});

test("warning rows: you RECEIVED a message ABOUT the merchant", () => {
  const g = recordsGraph([{ merchant: "DemoFlix", detail: "x", evidence: [ev("e1"), ev("e2", "email", "unverified")] }]);
  assert.deepEqual(g.nodes.map((n) => [n.id, n.col]), [["you", 0], ["m:DemoFlix", 2], ["e:e1", 1], ["e:e2", 1]]);
  assert.deepEqual(g.edges.map((e) => `${e.from}-${e.label}->${e.to}`), [
    "you-RECEIVED->e:e1", "e:e1-ABOUT->m:DemoFlix", "you-RECEIVED->e:e2", "e:e2-ABOUT->m:DemoFlix"
  ]);
  assert.equal(g.edges[3].tone, "muted", "an unverified message is drawn faded");
});

test("warning rows without messages: you PAID_TO the merchant in two columns", () => {
  const g = recordsGraph([{ merchant: "DemoGym", detail: "x", evidence: [] }, { merchant: "DemoGym", detail: "y", evidence: [] }]);
  assert.deepEqual(g.nodes.map((n) => [n.id, n.col]), [["you", 0], ["m:DemoGym", 1]], "the same merchant is drawn once");
  assert.deepEqual(g.edges.map((e) => e.label), ["PAID_TO"]);
});

test("warning rows are capped and the rest counted", () => {
  const many = Array.from({ length: GRAPH_LIMITS.merchants + 2 }, (_, i) => ({ merchant: `M${i}`, detail: "", evidence: [] }));
  assert.deepEqual(recordsGraph([]), { nodes: [], edges: [], more: 0 }, "no rows draws nothing, not a lone 'You'");
  const g = recordsGraph(many);
  assert.equal(g.nodes.filter((n) => n.kind === "merchant").length, GRAPH_LIMITS.merchants);
  assert.equal(g.more, 2);
  const busy = recordsGraph([{ merchant: "M", detail: "", evidence: ["a", "b", "c", "d", "e"].map((id) => ev(id)) }]);
  assert.equal(busy.nodes.filter((n) => n.kind === "event").length, GRAPH_LIMITS.eventsPerMerchant);
  assert.equal(busy.more, 2);
});

test("SIMILAR links carry the score and the person's decision", () => {
  const g = similarGraph([link("a", "b", "candidate", 0.82), link("c", "d", "confirmed", 0.93), link("e", "f", "rejected", 0.76)]);
  assert.deepEqual(g.edges.map((e) => [e.label, e.tone]), [["SIMILAR 0.82", "review"], ["SIMILAR 0.93", "ok"], ["SIMILAR 0.76", "muted"]]);
  assert.equal(g.nodes.find((n) => n.id === "m:a")?.caption, "2 payments");
  assert.equal(g.nodes.find((n) => n.id === "m:b")?.caption, "1 payment");
});

test("trust: each channel points at its trust levels with a count", () => {
  const g = trustGraph([{ source: "sms", trust: "authenticated_source", events: 4 }, { source: "sms", trust: "unverified", events: 1 }, { source: "email", trust: "authenticated_source", events: 2 }]);
  assert.equal(g.nodes.filter((n) => n.kind === "channel").length, 2);
  assert.equal(g.nodes.filter((n) => n.kind === "trust").length, 2, "a trust level shared by two channels is one node");
  assert.deepEqual(g.edges.map((e) => e.label), ["4 records", "1 record", "2 records"]);
});

test("two-channel payments: the payment is EVIDENCED_BY each message", () => {
  const g = corroboratedGraph([{ id: "p1", merchant: "DemoFlix", date: "2026-10-05", amountPaise: 64900, sources: ["sms", "email"], evidence: [ev("e1"), ev("e2", "email")] }], (p) => `Rs ${p / 100}`);
  assert.equal(g.nodes[0].caption, "Rs 649 · 2026-10-05");
  assert.deepEqual(g.edges.map((e) => `${e.from}-${e.label}->${e.to}`), ["p:p1-EVIDENCED_BY->e:e1", "p:p1-EVIDENCED_BY->e:e2"]);
});

test("layout: every node fits inside the drawing and every edge has a path", () => {
  const g = recordsGraph([{ merchant: "A", detail: "", evidence: [ev("1"), ev("2")] }, { merchant: "B", detail: "", evidence: [] }]);
  const out = layoutGraph(g);
  for (const n of out.nodes) {
    assert.ok(n.x - LAYOUT.nodeWidth / 2 >= 0 && n.x + LAYOUT.nodeWidth / 2 <= out.width, `${n.id} fits across`);
    assert.ok(n.y - LAYOUT.nodeHeight / 2 >= 0 && n.y + LAYOUT.nodeHeight / 2 <= out.height, `${n.id} fits down`);
  }
  assert.equal(out.edges.length, g.edges.length);
  assert.ok(out.edges.every((e) => e.path.startsWith("M") && Number.isFinite(e.lx) && Number.isFinite(e.ly)));
  assert.deepEqual(layoutGraph({ nodes: [], edges: [], more: 0 }).nodes, []);
});

test("long names are cut for the drawing only", () => {
  assert.equal(shorten("Short"), "Short");
  assert.equal(shorten("A very long merchant name from a statement", 10), "A very lo…");
});
