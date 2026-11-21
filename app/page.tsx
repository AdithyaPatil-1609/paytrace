/**
 * Public landing by default. The explicit demo keeps the existing sample
 * dashboard; personal records remain behind the /account session check.
 */
import { Dashboard } from "@/components/dashboard";
import { loadDemo } from "@/lib/data/load-demo";
import { Landing } from "@/components/marketing/landing";

// Read per request, so a change in the graph or in data/raw shows on reload.
export const dynamic = "force-dynamic";

export default async function Home({searchParams}:{searchParams:Promise<{demo?:string}>}) {
  if ((await searchParams).demo !== "1") return <Landing />;
  const { dataset, source, commitments, graph } = await loadDemo();
  return <Dashboard dataset={dataset} source={source} commitments={commitments} graph={graph} />;
}
