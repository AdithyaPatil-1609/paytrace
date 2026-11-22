/**
 * /demo: the synthetic demo, open to anyone without signing in, with the
 * "Try it" console built in. Each visitor gets a private, temporary copy of the
 * demo data: send bank SMS or emails, type your own, or try to break Paytrace,
 * and the five screens update. Nothing reaches Neo4j or real users' data.
 * Evaluators use this page, because Gmail sign-in is limited to approved test accounts.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Dashboard } from "@/components/dashboard";
import { SandboxConsole, SandboxLauncher } from "@/components/sandbox/sandbox-console";
import { sandboxView } from "@/lib/sandbox/dataset";
import { SANDBOX_COOKIE, validSandboxId } from "@/lib/sandbox/session";
import { getSandbox } from "@/lib/sandbox/store";
import type { SourceInfo } from "@/db/neo4j/dataset";

export const metadata: Metadata = { title: "Demo · Paytrace", alternates: { canonical: "/demo" } };

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  const box = validSandboxId(id) ? getSandbox(id) : null;
  const view = sandboxView(box);
  const source: SourceInfo = {
    kind: "fixture",
    counts: { payments: view.dataset.statement.length, messages: view.dataset.notifications.length, mandates: view.dataset.mandates.length, patterns: 0, commitments: 0 },
    note: view.statement ? `Your statement: ${view.statement.name}. Private to you; deleted after 2 hours.` : box ? "Demo: synthetic data plus the messages you sent. Private to you; deleted after 2 hours." : "Synthetic sample data. No account or email access."
  };
  return <>
    <Dashboard dataset={view.dataset} source={source} demoAction={<SandboxLauncher count={view.alerts.length} />} />
    <SandboxConsole asOf={view.asOf} alerts={view.alerts} log={box?.log ?? []} counts={view.counts} statement={view.statement} />
  </>;
}
