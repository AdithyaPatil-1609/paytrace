/**
 * /: the public landing page. It explains Paytrace and offers two ways in:
 * sign in (approved Google test accounts only) or the open demo.
 * A signed-in visitor goes straight to their account.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/web/components/landing";
import { accountConfigured, SESSION } from "@/server/accounts/security";
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
  // A signed-in visitor with no pending notice goes straight to their account.
  if ((await cookies()).get(SESSION)?.value && !notice) redirect("/account");

  return (
    <Landing
      configured={accountConfigured()}
      initialNotice={noticeText(notice)}
      initialNoticeIsError={noticeIsError(notice)}
      initialOpen={Boolean(params.signin || notice)}
    />
  );
}
