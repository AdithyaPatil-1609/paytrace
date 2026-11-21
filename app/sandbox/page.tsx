/**
 * /sandbox: the five screens on a private, temporary copy of the synthetic
 * demo data, plus the sandbox console to send SMS and emails, type a message,
 * or try to break Paytrace. No sign-in. Nothing reaches Neo4j or real users.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Dashboard } from "@/components/dashboard";
import { SandboxConsole } from "@/components/sandbox/sandbox-console";
import { sandboxView } from "@/lib/sandbox/dataset";
import { SANDBOX_COOKIE, validSandboxId } from "@/lib/sandbox/session";
import { getSandbox } from "@/lib/sandbox/store";
import type { SourceInfo } from "@/db/neo4j/dataset";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sandbox · Paytrace", alternates: { canonical: "/sandbox" } };

export default async function SandboxPage() {
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  const box = validSandboxId(id) ? getSandbox(id) : null;
  const view = sandboxView(box);
  const source: SourceInfo = {
    kind: "fixture",
    counts: { payments: view.dataset.statement.length, messages: view.dataset.notifications.length, mandates: view.dataset.mandates.length, patterns: 0, commitments: 0 },
    note: "Sandbox: synthetic data plus the messages you send. Private to you; deleted after 2 hours."
  };
  return <>
    <Dashboard dataset={view.dataset} source={source} />
    <SandboxConsole asOf={view.asOf} alerts={view.alerts} log={box?.log ?? []} counts={view.counts} />
  </>;
}
