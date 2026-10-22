import { Dashboard } from "@/components/dashboard";
import { getCommitmentsForPerson } from "@/db/neo4j/commitments";

// Read Neo4j at request time after the connection variables are supplied.
export const dynamic = "force-dynamic";

export default async function Home() {
  const commitments = await getCommitmentsForPerson();
  return <Dashboard commitments={commitments} />;
}
