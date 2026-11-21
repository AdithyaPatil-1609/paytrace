"use client";

import { useState } from "react";
import Link from "next/link";
import s from "./marketing.module.css";

const chapters = [
  {label:"Spot the repeat", title:"₹499. Again. And again.", body:"A small monthly charge is easy to miss. Twelve payments to the same service add up to ₹5,988 over a year.", note:"Illustrative example · not your account"},
  {label:"See the evidence", title:"A finding you can follow.", body:"The evidence graph connects a payment to its supporting messages and mandate. An unused-service signal gives you a reason to review it—not an automatic verdict.", note:"Neo4j connects the records behind each finding"},
  {label:"Choose what stays", title:"The next move is yours.", body:"Still useful? Keep it. No longer needed? Follow the service and payment-provider instructions, save confirmation, and check for later charges.", note:"Paytrace provides guidance; it does not cancel payments"},
];

export function ChargeStory() {
  const [step, setStep] = useState(0);
  const chapter = chapters[step];
  return <div className={s.story}><div className={s.storyTabs} aria-label="Sample charge walkthrough">{chapters.map((item,i)=><button key={item.label} onClick={()=>setStep(i)} aria-pressed={step===i} aria-controls="charge-chapter">{item.label}</button>)}</div><div id="charge-chapter" className={s.chapter} aria-live="polite"><div className={s.storyVisual}>
    {step===0?<><div className={s.months}>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(month=><div key={month}><span>{month}</span><strong>₹499</strong></div>)}</div><div className={s.storyTotal}><span>Canva · annual cost</span><strong>₹5,988</strong></div></>:step===1?<ol className={s.evidence}><li><span>Payment record</span><strong>Canva · ₹499 recurring</strong></li><li><span>Supporting receipt</span><strong>Subscription payment received</strong></li><li><span>Payment mandate</span><strong>CARD–CANVA · active</strong></li><li className={s.evidenceWarning}><span>⚠ Review signal</span><strong>Marked unused, but still charging</strong></li></ol>:<div className={s.decision}><span className={s.eyebrow}>From finding to next step</span><h3>Keep it intentionally.<br />Or leave with a plan.</h3><ol><li>Review the service’s cancellation steps.</li><li>Check the linked payment mandate.</li><li>Keep confirmation and watch future charges.</li></ol><Link href="/?demo=1" className={s.textLink}>Explore cancellation guidance in the demo</Link></div>}
    </div><div className={s.chapterCopy}><p className={s.caption}>{chapter.note}</p><h3>{chapter.title}</h3><p>{chapter.body}</p>{step<2?<button className={s.next} onClick={()=>setStep(step+1)}>Next: {chapters[step+1].label.toLowerCase()}</button>:<Link href="/login" className={s.next}>Start with my own account</Link>}</div></div></div>;
}
