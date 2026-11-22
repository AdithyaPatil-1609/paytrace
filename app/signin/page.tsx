/**
 * /signin: redirects to the home page with the sign-in drawer opened.
 * The standalone sign-in page is removed so users always experience the
 * sign-in drawer on the main landing page.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION } from "@/lib/accounts/security";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · Paytrace", alternates: { canonical: "/signin" } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = (await searchParams).notice ?? "";
  if ((await cookies()).get(SESSION)?.value && !notice) redirect("/account");
  redirect(notice ? `/?signin=1&notice=${encodeURIComponent(notice)}` : "/?signin=1");
}
