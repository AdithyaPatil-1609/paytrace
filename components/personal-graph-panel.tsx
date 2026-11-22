"use client";
/**
 * Beside the personal evidence diagram: merchants that may be the same one
 * (SIMILAR links the person confirms or rejects), how far each record can be
 * trusted, payments two channels confirm, and the exact Cypher that ran.
 * Everything comes from /api/account/graph, which reads the session's own profile.
 */
import { useCallback, useEffect, useState } from "react";
import type { Evidence, QueryRun } from "@/db/neo4j/warnings";
import type { SimilarLink } from "@/db/neo4j/merchant-links";
import type { Corroborated, ExtraRun, TrustRow } from "@/db/neo4j/evidence-trust";
import { TRUST_LABEL, type SourceTrust } from "@/lib/ingestion/trust";
import { formatINR } from "@/lib/presentation/format";

type GraphDetails = { asOf: string; similar: SimilarLink[]; trust: { bySource: TrustRow[]; corroborated: Corroborated[] }; queries: QueryRun[]; extraQueries: ExtraRun[]; incomplete: boolean };

const trustName = (level: string) => level === "legacy" ? "Older record, not verified" : TRUST_LABEL[level as SourceTrust] ?? level;

export function TrustBadge({ evidence }: { evidence: Pick<Evidence, "sourceTrust" | "trustReason"> }) {
  return <span className={`trust-badge trust-${evidence.sourceTrust}`} title={evidence.trustReason}>{TRUST_LABEL[evidence.sourceTrust]}</span>;
}

function SimilarRow({ link, onDecided }: { link: SimilarLink; onDecided: () => void }) {
  const [state, setState] = useState("");
  async function decide(decision: "confirmed" | "rejected") {
    setState("Saving…");
    const response = await fetch("/api/account/merchants/similar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: link.a.id, b: link.b.id, decision }) }).catch(() => null);
    setState(response?.ok ? "" : "Could not save; retry");
    if (response?.ok) onDecided();
  }
  const pct = Math.round(link.score * 100);
  return <li className={`similar-link similar-${link.status}`}>
    <div className="similar-pair" aria-label={`${link.a.name} and ${link.b.name}, score ${link.score}`}>
      <span className="similar-node"><strong>{link.a.name}</strong><small>{link.a.payments} {link.a.payments === 1 ? "payment" : "payments"}</small></span>
      <span className="similar-edge"><code>:SIMILAR</code><b>{link.score.toFixed(2)}</b><i style={{ width: `${pct}%` }}/></span>
      <span className="similar-node"><strong>{link.b.name}</strong><small>{link.b.payments} {link.b.payments === 1 ? "payment" : "payments"}</small></span>
    </div>
    <small>{link.reason} Method: {link.method.replaceAll("_", " ")} · {link.band === "strong" ? "strong match" : "needs your review"}</small>
    {link.status === "candidate" ? <small className="similar-actions">
      <button type="button" className="link-button" onClick={() => void decide("confirmed")}>Same merchant</button>
      <button type="button" className="link-button" onClick={() => void decide("rejected")}>Not the same</button>
      {state && <em role="status"> {state}</em>}
    </small> : <small>You {link.status === "confirmed" ? "confirmed" : "rejected"} this{link.decidedAt ? ` on ${link.decidedAt.slice(0, 10)}` : ""}.</small>}
  </li>;
}

function QueryDetails({ run, records }: { run: Pick<QueryRun, "name" | "purpose" | "cypher" | "ok" | "rows" | "ms"> & Partial<Pick<QueryRun, "warnings" | "settings" | "parameters">>; records?: QueryRun["records"] }) {
  return <details className="cypher-run">
    <summary>
      <strong>{run.name}</strong>
      <small className={run.ok ? "cypher-ok" : "cypher-failed"}>{run.ok ? "ran" : "failed"} · {run.rows} {run.rows === 1 ? "row" : "rows"}{run.warnings === undefined ? "" : ` · ${run.warnings} ${run.warnings === 1 ? "warning" : "warnings"}`} · {run.ms} ms</small>
    </summary>
    <p>{run.purpose}</p>
    {run.parameters && <p><small>Parameters: {run.parameters.map((p) => p === "profile" ? "$profile (your account, from the session; not shown)" : `$${p}${run.settings?.[p] === undefined ? "" : ` = ${run.settings[p]}`}`).join(" · ")}</small></p>}
    <pre>{run.cypher.trim()}</pre>
    {records && records.length > 0 && <ul className="cypher-records">
      {records.map((r, i) => <li key={i}><strong>{r.merchant}</strong> <small>{r.detail}</small>
        {r.evidence.length > 0 && <small> Evidence: {r.evidence.map((e) => <span key={e.id}>{e.source.toUpperCase()} {e.kind.replaceAll("_", " ")} · {e.date} <TrustBadge evidence={e}/> </span>)}</small>}
      </li>)}
    </ul>}
  </details>;
}

export function PersonalGraphPanel() {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<GraphDetails | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/graph", { cache: "no-store" });
      // A demo visitor's sample is still being written to Neo4j: try again shortly.
      if (response.status === 409) { setTimeout(() => setAttempt((n) => n + 1), 3000); return; }
      if (response.status === 401) { setData(null); if (window.location.pathname.startsWith("/account")) window.location.replace("/account?notice=session-expired"); return; }
      if (!response.ok) throw Error();
      setData(await response.json()); setError("");
    } catch { setError("Graph details could not be loaded. Retry in a moment."); }
  }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first); }, [load, attempt]);

  if (error) return <section className="evidence-live-details"><p role="alert">{error}</p></section>;
  if (!data) return <section className="evidence-live-details"><p>Reading your payment graph…</p></section>;
  const levels = [...new Set(data.trust.bySource.map((r) => r.trust))];
  const sources = [...new Set(data.trust.bySource.map((r) => r.source))];
  const count = (source: string, trust: string) => data.trust.bySource.find((r) => r.source === source && r.trust === trust)?.events ?? 0;

  return <div className="personal-graph">
    {data.incomplete && <p role="alert">One or more graph queries failed this time, so some results may be missing. See &quot;Cypher that ran&quot;.</p>}
    <details className="evidence-live-details" open>
      <summary>Possibly the same merchant <small>{data.similar.filter((l) => l.status === "candidate").length} to review</small></summary>
      <p>Neo4j links two of your merchants with <code>[:SIMILAR]</code> when their names look alike. It is a suggestion, not proof: payments stay separate, and a link never chains to a third merchant.</p>
      {data.similar.length ? <ul className="similar-list">{data.similar.map((link) => <SimilarRow key={`${link.a.id}-${link.b.id}`} link={link} onDecided={() => void load()}/>)}</ul> : <p>No similar merchant names found.</p>}
    </details>
    <details className="evidence-live-details">
      <summary>How far each record can be trusted</summary>
      <p>Set on the server from checks that really ran: Gmail&apos;s sender check, your phone&apos;s signature, or your own upload. Older records stay &quot;not verified&quot;.</p>
      {sources.length ? <table className="trust-table"><thead><tr><th>Channel</th>{levels.map((l) => <th key={l}>{trustName(l)}</th>)}</tr></thead>
        <tbody>{sources.map((s) => <tr key={s}><td>{s.toUpperCase()}</td>{levels.map((l) => <td key={l}>{count(s, l)}</td>)}</tr>)}</tbody></table> : <p>No evidence stored yet.</p>}
      <p><strong>Confirmed by two channels: {data.trust.corroborated.length}</strong></p>
      {data.trust.corroborated.length > 0 && <ul className="cypher-records">{data.trust.corroborated.map((p) => <li key={p.id}><strong>{p.merchant}</strong> <small>{formatINR(p.amountPaise / 100)} on {p.date}: {p.sources.join(" + ")}. {p.evidence.map((e) => <span key={e.id}>{e.source.toUpperCase()} <TrustBadge evidence={e}/> </span>)}</small></li>)}</ul>}
    </details>
    <details className="evidence-live-details">
      <summary>Cypher that ran <small>{data.queries.length + data.extraQueries.length} queries · as of {data.asOf}</small></summary>
      <p>The fixed, parameterized queries Paytrace ran on your own graph for this page. The browser cannot send its own Cypher; your account id is passed as <code>$profile</code> from the session and is not shown.</p>
      {data.queries.map((run) => <QueryDetails key={run.key} run={run} records={run.records}/>)}
      {data.extraQueries.map((run) => <QueryDetails key={run.key} run={run}/>)}
    </details>
  </div>;
}
