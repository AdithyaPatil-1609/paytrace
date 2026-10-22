import { Dashboard } from "@/components/dashboard";
import { loadFixtures } from "@/lib/fixtures";

// The fixture is read per request so an edit to data/raw shows up on reload.
export const dynamic = "force-dynamic";

export default async function Home() {
  const dataset = loadFixtures();
  return <Dashboard dataset={dataset} />;
}
