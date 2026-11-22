/**
 * /: the public landing page. It explains Paytrace and offers two ways in:
 * sign in (approved Google test accounts only) or the open demo.
 * A signed-in visitor goes straight to their account.
 */
import { redirect } from "next/navigation";
import { Landing } from "@/web/components/landing";
import { accountConfigured } from "@/server/accounts/security";
import { hasLiveSession } from "@/server/accounts/live-session";
import { noticeIsError, noticeText } from "@/server/accounts/notices";
import "./account/account.css";
import "./account/login.css";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ demo?: string; signin?: string; notice?: string }>
}) {
  const params = await searchParams;
  if (params.demo === "1") redirect("/demo");

  const notice = params.notice ?? "";
  // Only a session that is still valid goes straight to the account. An old,
  // expired cookie gets the plain landing page, not a "signed out" bounce.
  if (!notice && (await hasLiveSession())) redirect("/account");

  return (
    <Landing
      configured={accountConfigured()}
      initialNotice={noticeText(notice)}
      initialNoticeIsError={noticeIsError(notice)}
      initialOpen={Boolean(params.signin || notice)}
    />
  );
}

