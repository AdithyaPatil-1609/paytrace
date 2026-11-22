/**
 * Signed-phone attacks for the sandbox "Try to break it" buttons. Each one
 * builds a real signed request with a throwaway P-256 key and runs it through
 * the same check the live /api/ingest/sms route uses (identifySmsSender).
 * Nothing is stored; the result is shown step by step.
 */
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { identifySmsSender } from "@/server/ingestion/device-auth";
import { signedBytes } from "@/server/ingestion/signature";
import type { Sandbox, SandboxLogEntry, SandboxStep } from "./store";

export type SignedAttack = "replay" | "tamper" | "stale" | "unknown";

const LABEL: Record<SignedAttack, string> = {
  replay: "Replay a signed phone request",
  tamper: "Change the amount after signing",
  stale: "Send a 10-minute-old signed request",
  unknown: "Request from a phone that was never paired"
};

export async function runSignedAttack(box: Sandbox, attack: SignedAttack): Promise<SandboxLogEntry> {
  const phone = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const deviceId = `sbx_${randomBytes(16).toString("hex")}`;
  const owner = { deviceId, sub: "sandbox", profile: `sandbox-${box.id}`, publicKey: phone.publicKey.export({ format: "der", type: "spki" }).toString("base64") };
  const lookup = async (id: string) => (attack !== "unknown" && id === deviceId ? owner : null);
  const body = JSON.stringify({ sender: "AX-ARCBNK-S", text: "Rs 199.00 debited from A/c XX9912 for UPI/GYMFITLINE. -ARCLIGHT BANK", receivedAt: new Date().toISOString() });

  const send = (options: { time?: number; nonce?: string; sentBody?: string } = {}) => {
    const time = options.time ?? Date.now();
    const nonce = options.nonce ?? randomBytes(18).toString("base64url");
    const signature = sign("sha256", signedBytes(deviceId, time, nonce, body), { key: phone.privateKey, dsaEncoding: "der" }).toString("base64");
    const sent = options.sentBody ?? body;
    return identifySmsSender(new Request("http://sandbox.local/api/ingest/sms", {
      method: "POST", body: sent,
      headers: { "content-type": "application/json", "x-paytrace-device-id": deviceId, "x-paytrace-time": String(time), "x-paytrace-nonce": nonce, "x-paytrace-signature": signature }
    }), lookup);
  };
  const describe = (result: Awaited<ReturnType<typeof send>>) => (result.ok ? "accepted (202)" : `refused: ${result.error} (${result.status})`);

  const steps: SandboxStep[] = [];
  let accepted = false;
  if (attack === "replay") {
    const nonce = randomBytes(18).toString("base64url"), time = Date.now();
    const first = await send({ nonce, time });
    steps.push({ name: "Original request", ok: first.ok, detail: `Signed by the paired phone: ${describe(first)}.` });
    const again = await send({ nonce, time });
    steps.push({ name: "The same request again", ok: !again.ok, detail: `Captured and sent a second time: ${describe(again)}. The one-use number was already seen.` });
    accepted = !again.ok;
  } else if (attack === "tamper") {
    const result = await send({ sentBody: body.replace("199.00", "1,99,999.00") });
    steps.push({ name: "Amount changed after signing", ok: !result.ok, detail: `Rs 199.00 changed to Rs 1,99,999.00 in transit: ${describe(result)}. The signature covers every byte of the message.` });
    accepted = !result.ok;
  } else if (attack === "stale") {
    const result = await send({ time: Date.now() - 10 * 60_000 });
    steps.push({ name: "Old request", ok: !result.ok, detail: `Signed 10 minutes ago: ${describe(result)}. Requests more than 5 minutes off are refused before any database lookup.` });
    accepted = !result.ok;
  } else {
    const result = await send();
    steps.push({ name: "Unpaired phone", ok: !result.ok, detail: `Validly signed, but by a key no account paired: ${describe(result)}.` });
    accepted = !result.ok;
  }

  box.counter += 1;
  const entry: SandboxLogEntry = {
    n: box.counter, at: new Date().toISOString().slice(0, 10), channel: "phone", sender: "Signed phone request", preview: LABEL[attack],
    // "accepted" here means the defence held.
    accepted, summary: accepted ? "Blocked, as expected" : "Defence did not hold", steps
  };
  box.log.unshift(entry);
  return entry;
}
