/**
 * /demo: Priya's synthetic demo, open to anyone without signing in.
 * Evaluators use this page, because Gmail sign-in is limited to approved test accounts.
 */
import { Dashboard } from "@/components/dashboard";
import { loadDemo } from "@/lib/data/load-demo";
import type { Metadata } from "next";


export const metadata: Metadata = { title: "Demo · Paytrace", alternates: { canonical: "/demo" } };

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const { dataset, source, commitments, graph } = await loadDemo(true);
  return <Dashboard dataset={dataset} source={source} commitments={commitments} graph={graph} />;
}
