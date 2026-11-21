/** Only Google's own Authentication-Results line is trusted, and only a clear failure drops an email. */
import test from "node:test";
import assert from "node:assert/strict";
import { fromDomain, senderAuthentication } from "../../lib/ingestion/dkim";

const ar = (value: string) => ({ name: "Authentication-Results", value });
const from = "Spotify <no-reply@spotify.com>";

test("DMARC pass, or a DKIM signature from the From domain, passes", () => {
  assert.equal(senderAuthentication([ar("mx.google.com; dkim=pass header.i=@spotify.com header.s=a; spf=pass; dmarc=pass (p=REJECT) header.from=spotify.com")], from), "pass");
  assert.equal(senderAuthentication([ar("mx.google.com; dkim=pass header.i=@mail.spotify.com; spf=neutral")], from), "pass");
});

test("a spoofed sender that Gmail failed is dropped", () => {
  assert.equal(senderAuthentication([ar("mx.google.com; dkim=none; spf=fail smtp.mailfrom=evil.example; dmarc=fail (p=NONE) header.from=spotify.com")], from), "fail");
  assert.equal(senderAuthentication([ar("mx.google.com; dkim=pass header.i=@evil.example; spf=softfail; dmarc=fail header.from=spotify.com")], from), "fail");
});

test("a fake Authentication-Results line added by the sender is ignored", () => {
  assert.equal(senderAuthentication([ar("spotify.com; dkim=pass header.i=@spotify.com; dmarc=pass")], from), "unknown");
  assert.equal(senderAuthentication([
    ar("mx.google.com; dkim=none; spf=fail; dmarc=fail header.from=spotify.com"),
    ar("mx.google.com.evil; dmarc=pass")
  ], from), "fail");
});

test("no verdict is unknown, never a reason to drop", () => {
  assert.equal(senderAuthentication([], from), "unknown");
  assert.equal(senderAuthentication(undefined, from), "unknown");
  assert.equal(fromDomain("Netflix <info@account.netflix.com>"), "account.netflix.com");
  assert.equal(fromDomain("no address"), null);
});
