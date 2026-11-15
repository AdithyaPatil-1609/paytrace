// Stand-in for the Paytrace route POST /api/ingest/sms, for testing the phone app
// on this laptop. It does the same three things as the real route: checks the
// pairing code, limits the size, and prints what arrives. No packages needed.
// Run:  node receiver.mjs     Stop: Ctrl + C

import http from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

const PORT = 3000;
const MAX_BODY_CHARS = 2000;
const EXPECTED = readFileSync(new URL("./pairing-code.txt", import.meta.url), "utf8").trim();

let received = 0;

function isPairedDevice(code) {
  if (!code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(EXPECTED);
  return a.length === b.length && timingSafeEqual(a, b);
}

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/ingest/sms") {
    return reply(res, 404, { ok: false, error: "Not found" });
  }

  if (!isPairedDevice(req.headers["x-paytrace-device"])) {
    console.log("REFUSED: wrong or missing pairing code");
    return reply(res, 401, { ok: false, error: "Unknown device" });
  }

  let text = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) tooLarge = true;
  });

  req.on("end", () => {
    if (tooLarge) {
      console.log("REFUSED: message too large");
      return reply(res, 413, { ok: false, error: "Message too large" });
    }
    try {
      const event = JSON.parse(text);
      received += 1;
      console.log(`RECEIVED #${received} at ${new Date().toLocaleTimeString()}:`, event);
      reply(res, 200, { ok: true });
    } catch {
      console.log("REFUSED: not valid JSON");
      reply(res, 400, { ok: false, error: "Not valid JSON" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Paytrace test receiver is listening on http://localhost:${PORT}/api/ingest/sms`);
  console.log("Emulator address:  http://10.0.2.2:3000");
  console.log(`Pairing code:      ${EXPECTED}`);
});
