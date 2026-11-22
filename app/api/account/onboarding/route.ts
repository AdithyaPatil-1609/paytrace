/**
 * POST /api/account/onboarding  (JSON)
 * The sign-up steps after Google sign-in:
 *   {action:"phone", idToken}   a Firebase ID token from a phone SMS code
 *   {action:"phone-skip"}       no phone number
 *   {action:"sms", answer}      consent to read bank SMS: "yes" | "no"
 *   {action:"finish"}           sign-up done (needs a connected Gmail)
 * Every step acts on the signed-in person only, never on an id the browser sent.
 */
import type { NextRequest } from "next/server";
import { finishSignup, setSmsConsent, setVerifiedPhone, skipPhone } from "@/db/neo4j/accounts";
import { verifiedPhoneFromToken } from "@/lib/accounts/firebase-phone";
import { requireUser } from "@/lib/accounts/require-user";
import { SMS_CONSENT_VERSION } from "@/lib/accounts/sms-consent";
import { readJsonBody } from "@/lib/security/body";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const headers = { "Cache-Control": "no-store" };
const answer = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers });

export async function POST(request: NextRequest) {
  const hit = takeHit("signup", clientKey(request), LIMITS.signup);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;
  const { sub, linked } = signedIn.user;
  const body = await readJsonBody(request, 6144);
  if (!body.ok) return answer({ error: body.error }, body.status);
  const input = (body.value && typeof body.value === "object" ? body.value : {}) as Record<string, unknown>;
  try {
    switch (input.action) {
      case "phone": {
        const phone = await verifiedPhoneFromToken(input.idToken);
        if (!phone) return answer({ error: "The phone code could not be verified. Request a new code and try again." }, 400);
        await setVerifiedPhone(sub, phone);
        return answer({ ok: true, last4: phone.slice(-4) });
      }
      case "phone-skip":
        await skipPhone(sub);
        return answer({ ok: true });
      case "sms":
        if (input.answer !== "yes" && input.answer !== "no") return answer({ error: "Answer yes or no" }, 400);
        await setSmsConsent(sub, input.answer, SMS_CONSENT_VERSION);
        return answer({ ok: true });
      case "finish":
        // Gmail (the sign-in one or another) is the one source sign-up requires.
        if (!linked) return answer({ error: "Connect a Gmail account first." }, 409);
        await finishSignup(sub);
        return answer({ ok: true });
      default:
        return answer({ error: "Unknown step" }, 400);
    }
  } catch {
    return answer({ error: "Account storage unavailable; retry" }, 503);
  }
}
