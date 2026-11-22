/**
 * Whose Neo4j profile a request may read: the signed-in person's, or else the
 * demo visitor's own sandbox graph once it is written. Never a profile id sent
 * by the browser.
 */
import type { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { sandboxProfile } from "@/db/neo4j/sandbox-graph";
import { SESSION } from "@/lib/accounts/security";
import { SANDBOX_COOKIE, validSandboxId } from "./session";
import { getSandbox } from "./store";

export type GraphReader = { profile: string; kind: "account" | "sandbox" } | { profile: null; kind: "none" | "syncing" };

export async function graphProfileFor(request: NextRequest, allowSandbox = true): Promise<GraphReader> {
  const user = await accountForSession(request.cookies.get(SESSION)?.value);
  if (user) return { profile: user.profile, kind: "account" };
  if (!allowSandbox) return { profile: null, kind: "none" };
  const id = request.cookies.get(SANDBOX_COOKIE)?.value;
  const box = validSandboxId(id) ? getSandbox(id) : null;
  if (box?.graph === "ready") return { profile: sandboxProfile(box.id), kind: "sandbox" };
  return { profile: null, kind: box?.graph === "syncing" ? "syncing" : "none" };
}
