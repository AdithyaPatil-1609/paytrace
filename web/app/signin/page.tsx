/**
 * /signin: redirects to the home page with the sign-in drawer opened.
 * The standalone sign-in page is removed so users always experience the
 * sign-in drawer on the main landing page.
 */
import { redirect } from "next/navigation";
import { hasLiveSession } from "@/server/accounts/live-session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · Paytrace", alternates: { canonical: "/signin" } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = (await searchParams).notice ?? "";
  if (!notice && (await hasLiveSession())) redirect("/account");
  redirect(notice ? `/?signin=1&notice=${encodeURIComponent(notice)}` : "/?signin=1");
}
