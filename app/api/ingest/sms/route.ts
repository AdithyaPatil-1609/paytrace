// Receives payment alerts from the Paytrace Companion Android app (android/).
// Sunday version: checks the pairing code, limits the size, and prints what arrives.
// The full nine-step pipeline (Document 2, D2) is built during the hackathon.

import { timingSafeEqual } from "node:crypto";

const MAX_BODY_CHARS = 2000;

function isPairedDevice(code: string | null): boolean {
  const expected = process.env.PAYTRACE_DEVICE_CODE;
  if (!code || !expected) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isPairedDevice(request.headers.get("x-paytrace-device"))) {
    return Response.json({ ok: false, error: "Unknown device" }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return Response.json({ ok: false, error: "Message too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: "Not valid JSON" }, { status: 400 });
  }

  console.log("[ingest/sms] received:", body);
  return Response.json({ ok: true });
}
