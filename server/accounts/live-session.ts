/**
 * Whether the visitor's session cookie still belongs to a live account session.
 * Pages use this instead of "is there a cookie", so an expired cookie shows the
 * landing page rather than bouncing through /account to a "signed out" notice.
 */
import { cookies } from "next/headers";
import { accountForSession } from "@/neo4j/accounts";
import { accountConfigured, SESSION } from "@/server/accounts/security";

export async function hasLiveSession() {
  const raw = (await cookies()).get(SESSION)?.value;
  if (!raw || !accountConfigured()) return false;
  try {
    return Boolean(await accountForSession(raw));
  } catch {
    return false;
  }
}
