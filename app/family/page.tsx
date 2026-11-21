/**
 * /family: Family Access (share a read-only view, see and revoke who has it)
 * and Family View (payments someone shared with you). Signed-in only.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accountForSession } from "@/db/neo4j/accounts";
import { SESSION } from "@/lib/accounts/security";
import { FamilyAccess } from "@/components/family-access";
import "../account/account.css";
import "./family.css";

export const metadata = { title: "Family access · Paytrace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const raw = (await cookies()).get(SESSION)?.value;
  let account = null;
  try { account = raw ? await accountForSession(raw) : null; } catch { account = null; }
  if (!account) redirect(raw ? "/signin?notice=session-expired" : "/signin");
  return <FamilyAccess name={account.name.split(" ")[0] ?? ""}/>;
}
