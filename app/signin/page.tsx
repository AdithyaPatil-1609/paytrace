/**
 * /signin: the sign-in page, separate from the landing page.
 * Only Google accounts approved as test users can sign in until Google's
 * security review is complete, so the page always offers the demo as well.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignIn } from "@/components/sign-in";
import { accountConfigured, SESSION } from "@/lib/accounts/security";
import { noticeIsError, noticeText } from "@/lib/accounts/notices";
import "../account/account.css";
import "../account/login.css";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = (await searchParams).notice ?? "";
  // A visitor with a session goes to the account page, unless an error sent them here.
  if ((await cookies()).get(SESSION)?.value && !notice) redirect("/account");
  return <SignIn configured={accountConfigured()} notice={noticeText(notice)} noticeIsError={noticeIsError(notice)} />;
}
