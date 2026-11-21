"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chevron } from "@/components/chrome/profile-menu";
import { Dashboard } from "@/components/dashboard";
import type { readLiveDashboard } from "@/db/neo4j/live";
import type { SourceInfo } from "@/db/neo4j/dataset";
import type { Dataset } from "@/lib/payments/types";
import { formatINR } from "@/lib/presentation/format";
import { SubscriptionWatchlist } from "@/components/subscription-watchlist";
import { accountErrorMessage } from "@/lib/accounts/errors";
import { IphoneConnect } from "@/components/iphone-connect";
import { GraphWarningsPanel } from "@/components/graph-warnings";

type Snapshot = Awaited<ReturnType<typeof readLiveDashboard>> & {
  linked: boolean; lastSync: string | null; syncStatus: string | null; syncError?:string|null; iphone?: boolean;
};

export function AccountDashboard({name,email,linked,lastSync,asOf,notice,noticeIsError}: {
  name: string; email: string; linked: boolean; lastSync: string | null; asOf: string; notice?: string; noticeIsError?:boolean;
}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");
  const [loadError,setLoadError]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [syncResult,setSyncResult]=useState("");
  const started=useRef(false);
  const refresh=useCallback(async()=>{
    try {
      const response=await fetch("/api/account/summary",{cache:"no-store"});
      if(response.status===401){window.location.replace("/account?notice=session-expired");return;}
      if(!response.ok)throw Error();
      setSnapshot(await response.json());setLoadError("");
    } catch {setLoadError("Your records could not be loaded. Check the Neo4j connection.");}
  },[]);
  const sync=useCallback(async(history=false,days:90|365=365)=>{
    setSyncing(true);setError("");setSyncResult("");
    try {
      const response=await fetch(`/api/account/gmail/sync${history?`?history=1&days=${days}`:""}`,{method:"POST"});
      if(response.status===401){window.location.replace("/account?notice=session-expired");return;}
      if(!response.ok){
        const result=await response.json().catch(()=>({}));
        setError(accountErrorMessage(result.code)??"Sync could not finish. Check Gmail connection and retry.");
      } else {
        const result=await response.json();
        if(result.status==="ready")setSyncResult(`Scanned ${result.scanned??0} emails · ${result.accepted} new or updated · ${result.duplicates??0} already recorded · ${result.skipped} skipped (${result.marketingSkipped??0} promotional, ${result.senderSkipped??0} sender-filtered, ${result.subscriptionSkipped??0} unrecognized) · ${result.ignored??0} old false positives hidden · ${result.registrations??0} zero-cost subscriptions · ${result.renewals??0} renewal notices · ${result.candidates??0} subscription candidates.`);
        else setSyncResult("A sync is already running or Gmail was disconnected. Wait for it to finish, then retry.");
      }
    } catch {setError("Sync could not finish. Check Gmail connection and retry.");}
    finally {setSyncing(false);await refresh();}
  },[refresh]);
  useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),10000);return()=>{clearTimeout(initial);clearInterval(timer);};},[refresh]);
  useEffect(()=>{const initial=setTimeout(()=>{if(linked&&!lastSync&&!started.current){started.current=true;void sync();}},0);return()=>clearTimeout(initial);},[linked,lastSync,sync]);

  const connected=snapshot?.linked??linked;
  const needsReconnect=snapshot?.syncStatus==="reauthorize";
  const syncingNow=syncing||snapshot?.syncStatus==="syncing";
  const data=snapshot?.summary;
  const dataset: Dataset=snapshot?.dataset??{asOf,statement:[],notifications:[],mandates:[],usage:[],dictionary:[]};
  const source: SourceInfo={kind:"neo4j",personal:true,note:data?.note??"Loading your personal payment history from Neo4j.",counts:{payments:data?.counts.payments??0,messages:(data?.counts.email??0)+(data?.counts.sms??0),mandates:dataset.mandates.length,patterns:dataset.dictionary.length,commitments:data?.commitments.length??0}};

  const controls=<details className="personal-menu">
    <summary className="persona personal-menu-trigger">
      <b>{name[0]?.toUpperCase()??"U"}</b><span>{name.split(" ")[0]}</span>
      <Chevron/>
    </summary>
    <div className="personal-menu-panel account-card">
      <p className="account-eyebrow">YOUR ACCOUNT</p>
      <strong>{name}</strong><p className="personal-email">{email}</p>
      <hr/>
      <p className="account-eyebrow">DATA CONNECTION · GMAIL</p>
      <p className="account-note">{needsReconnect?"Permission expired. Reconnect to resume sync.":connected?"Connected · read-only":"Optional: read financial messages from the Gmail account you signed in with. Google will ask for permission; Paytrace never sends or deletes emails."}</p>
      {!connected||needsReconnect?<form action="/api/auth/google/start" method="post"><input type="hidden" name="mode" value="link"/><button className="account-button primary" type="submit">{needsReconnect?"Reconnect Gmail":"Connect Gmail securely"}</button></form>:<>
        <p className="account-note">Last successful sync: {snapshot?.lastSync?new Date(snapshot.lastSync).toLocaleString():lastSync?new Date(lastSync).toLocaleString():"Waiting for first sync"}</p>
        <button className="account-button primary" disabled={syncingNow} onClick={()=>void sync()}>{syncingNow?"Synchronizing…":"Sync now"}</button>
        <button className="account-button" disabled={syncingNow} onClick={()=>void sync(true,90)}>Rescan last 90 days</button>
        <button className="account-button" disabled={syncingNow} onClick={()=>void sync(true,365)}>Rescan last 12 months</button>
        {syncResult&&<p className="account-note" role="status">{syncResult}</p>}
      </>}
      {connected&&<form action="/api/account/gmail/disconnect" method="post"><button className="account-button danger" type="submit">Disconnect Gmail</button></form>}
      <hr/>
      <IphoneConnect connected={snapshot?.iphone===true} onChange={()=>void refresh()}/>
      <hr/>
      <form action="/api/auth/logout" method="post"><button className="account-button" type="submit">Sign out</button></form>
      <Link className="account-demo-link" href="/demo">Explore synthetic demo</Link>
    </div>
  </details>;
  const persistedError=accountErrorMessage(snapshot?.syncError);
  const message=loadError||error||(syncingNow?"Synchronizing financial emails…":persistedError|| (needsReconnect?"Reconnect Gmail from your account menu to resume imports.":!connected?noticeIsError&&notice?notice:"Connect Gmail from your account menu to import payments. Gmail access is optional.":!snapshot?"Loading your personal payment history…":notice?.includes("first sync")&&snapshot.lastSync?"Gmail connected. Your payment history is up to date.":noticeIsError&&notice?notice:"Gmail connected · read-only. Use your account menu to sync."));
  const banner=<p className="personal-status" role={error||loadError||persistedError||noticeIsError?"alert":"status"}>{message}</p>;
  const watchlist=<SubscriptionWatchlist registrations={data?.subscriptionRegistrations??[]} renewals={data?.subscriptionRenewals??[]} candidates={data?.subscriptionCandidates??[]} scheduled={data?.scheduledDebits??[]} asOf={dataset.asOf} showEmpty={Boolean(snapshot)} exclude={(data?.commitments??[]).flatMap(item=>[item.merchant,item.rawNarration])}/>;
  const activity=<details className="personal-activity" open>
    <summary>Recent imported payment evidence <small>{data?.counts.review??0} need duplicate review</small></summary>
    <p>Includes one-off events and notices that may not be recurring payments.</p>
    {data?.recentEvents.length?<div className="account-table">{data.recentEvents.map(event=><div key={event.noticeId}><span><strong>{event.brand}</strong><small>{event.channel.toUpperCase()} · {event.eventType.replaceAll("_"," ")} · {event.sentOn}</small></span><strong>{event.amount===undefined?(event.planPrice===undefined?"Amount unknown":`${formatINR(event.planPrice)} reported`):formatINR(event.amount)}{["subscription_renewal","debit_scheduled"].includes(event.eventType)?" scheduled":""}</strong></div>)}</div>:<p>No imported financial messages yet.</p>}
  </details>;

  return <Dashboard dataset={dataset} source={source} commitments={data?.commitments??[]} account={{name,controls,notice:banner,activity,subscriptionAlerts:watchlist,graphWarnings:<GraphWarningsPanel/>}}/>;
}
