/**
 * App entry (server).
 * 1. Prefer the live Neo4j dataset, Cypher commitments and evidence graph findings.
 * 2. Else offline CSV fixture.
 * 3. Hand the result to the client shell (components/dashboard.tsx).
 */
import { Dashboard } from "@/components/dashboard";
import { loadDemo } from "@/lib/data/load-demo";
import { accountConfigured } from "@/lib/accounts/security";
import { redirect } from "next/navigation";

// Read per request, so a change in the graph or in data/raw shows on reload.
export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams:Promise<{demo?:string}>}) {
  const staticDemo = (await searchParams).demo === "1";
  if (accountConfigured() && !staticDemo) redirect("/account");
  const { dataset, source, commitments, graph } = await loadDemo(staticDemo);
  return <Dashboard dataset={dataset} source={source} commitments={commitments} graph={graph} />;
}
