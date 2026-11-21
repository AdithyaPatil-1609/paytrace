/**
 * /: the public landing page. It explains Paytrace and offers two ways in:
 * sign in (approved Google test accounts only) or the open demo.
 * A signed-in visitor goes straight to their account.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { SESSION } from "@/lib/accounts/security";
import "./account/account.css";
import "./account/login.css";
import type { Metadata } from "next";


export const metadata: Metadata = { alternates: { canonical: "/" } };

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  // Old links such as /?demo=1 still work.
  if ((await searchParams).demo === "1") redirect("/demo");
  if ((await cookies()).get(SESSION)?.value) redirect("/account");
  return <Landing />;
}
