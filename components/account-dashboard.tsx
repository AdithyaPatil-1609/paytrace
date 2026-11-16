"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { readLiveSummary } from "@/db/neo4j/live";

type Summary=Awaited<ReturnType<typeof readLiveSummary>>;
type Snapshot={linked:boolean;lastSync:string|null;syncStatus:string|null;summary:Summary};
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
export function AccountDashboard({name,email,linked,lastSync}:{name:string;email:string;linked:boolean;lastSync:string|null}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");
  const [syncing,setSyncing]=useState(false);
  const started=useRef(false);
  const refresh=useCallback(async()=>{
    try { const r=await fetch("/api/account/summary",{cache:"no-store"}); if(r.status===401){window.location.replace("/account?notice=session-expired");return;} if(!r.ok)throw Error(); setSnapshot(await r.json()); } catch {setError("Your records could not be loaded. Check the Neo4j connection.");}
  },[]);
  const sync=useCallback(async()=>{
    setSyncing(true);setError("");
    try {const r=await fetch("/api/account/gmail/sync",{method:"POST"});if(r.status===401){window.location.replace("/account?notice=session-expired");return;}if(!r.ok)throw Error();} catch {setError("Sync could not finish. Check Gmail connection and retry.");} finally {setSyncing(false);await refresh();}
  },[refresh]);
  useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),10000);return()=>{clearTimeout(initial);clearInterval(timer);};},[refresh]);
  useEffect(()=>{const initial=setTimeout(()=>{if(linked&&!lastSync&&!started.current){started.current=true;void sync();}},0);return()=>clearTimeout(initial);},[linked,lastSync,sync]);
  const connected=snapshot?.linked??linked;
  const needsReconnect=snapshot?.syncStatus==="reauthorize";
  const data=snapshot?.summary;
  return <section className="account-content">
    <div className="account-intro"><div><p className="account-eyebrow">PERSONAL DASHBOARD</p><h1>Welcome, {name.split(" ")[0]}.</h1><p>{email} · Your private payment graph</p></div><form action="/api/auth/logout" method="post"><button className="account-button small" type="submit">Sign out</button></form></div>
    <div className="account-layout"><div className="account-card"><p className="account-eyebrow">DATA CONNECTIONS</p><h2>Gmail</h2><div className="account-identity"><span>{name[0]?.toUpperCase()??"U"}</span><div><strong>{name}</strong><p>{email}</p></div></div><span className={connected&&!needsReconnect?"account-pill success":"account-pill"}>{needsReconnect?"Reconnect required":connected?"Connected · read-only":"Not linked"}</span>
      {!connected||needsReconnect?<><p className="account-note">Allow Paytrace to read Gmail to identify supported payment messages. Google will show its real consent screen. We never send or delete your emails.</p><form action="/api/auth/google/start" method="post"><input type="hidden" name="mode" value="link"/><button className="account-button primary" type="submit">{needsReconnect?"Reconnect Gmail":"Connect Gmail securely"}</button></form>{!connected&&<p className="account-note">Optional — you can keep using the dashboard without connecting Gmail.</p>}</>:<><p className="account-note">Last successful sync: {snapshot?.lastSync?new Date(snapshot.lastSync).toLocaleString():lastSync?new Date(lastSync).toLocaleString():"Waiting for first sync"}</p><button className="account-button primary" disabled={syncing||snapshot?.syncStatus==="syncing"} onClick={()=>void sync()}>{syncing||snapshot?.syncStatus==="syncing"?"Synchronizing…":"Sync now"}</button></>}
      {connected&&<form action="/api/account/gmail/disconnect" method="post"><button className="account-button danger" type="submit">Disconnect Gmail</button></form>}
      <p className="account-note">Only supported payment evidence is stored. Missing notices and incomplete email history are treated as uncertain.</p>{error&&<p className="account-warning" role="alert">{error}</p>}
    </div><div className="account-card"><p className="account-eyebrow">LIVE NEO4J INSIGHTS</p><h2>Your payment overview</h2><p>Updates automatically every 10 seconds while this page is open.</p><div className="account-stats"><div><span>Payment events</span><strong>{data?data.counts.email+data.counts.sms:"—"}</strong></div><div><span>Unique payments</span><strong>{data?.counts.payments??"—"}</strong></div><div><span>Recurring payments</span><strong>{data?.commitments.length??"—"}</strong></div><div><span>Needs review</span><strong>{data?.counts.review??"—"}</strong></div></div><h3>Recurring commitments</h3>{data?.commitments.length?<div className="account-table">{data.commitments.map(p=><div key={p.id}><span><strong>{p.merchant}</strong><small>{p.cadence} · {p.debitCount} recorded debits</small></span><strong>{money(p.annualCost)}<small>estimated annually</small></strong></div>)}</div>:<p className="account-note">No recurring commitments detected yet. Import additional payment history to discover patterns.</p>}</div></div>
    <div className="account-card activity-card"><p className="account-eyebrow">PAYMENT EVIDENCE</p><h2>Recent activity</h2>{data?.recentEvents.length?<div className="account-table">{data.recentEvents.map(e=><div key={e.noticeId}><span><strong>{e.brand}</strong><small>{e.channel.toUpperCase()} · {e.eventType.replaceAll("_"," ")} · {e.sentOn}</small></span><strong>{e.amount===undefined?"—":money(e.amount)}</strong></div>)}</div>:<p className="account-note">No imported financial messages yet. Connect Gmail and sync your inbox to see activity.</p>}</div>
  </section>;
}
