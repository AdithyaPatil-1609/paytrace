# Signed requests from the phone (cards M2 and S5)

The server side is done: `lib/ingestion/signature.ts`, `lib/ingestion/device-auth.ts`, `lib/ingestion/nonce-store.ts`, `db/neo4j/devices.ts` and the routes under `app/api/devices/`. This page tells the Android app exactly what to send.

## 1. Make the key once (Android Keystore)

```kotlin
val spec = KeyGenParameterSpec.Builder("paytrace-device", KeyProperties.PURPOSE_SIGN)
    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
    .setDigests(KeyProperties.DIGEST_SHA256)
    .setIsStrongBoxBacked(hasStrongBox) // try true, fall back to false on StrongBoxUnavailableException
    .build()
val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
kpg.initialize(spec)
val pair = kpg.generateKeyPair()
val publicKeyBase64 = Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP) // X.509 SubjectPublicKeyInfo
```

The private key never leaves the Keystore.

## 2. Pair once

1. The person signs in at paytrace.co.in, opens the account menu and taps **Pair a phone**. The page shows an 8-character code, for example `K7QM-2XRA`. It works once and lasts 10 minutes.
2. The app sends:

```
POST /api/devices/pair
Content-Type: application/json

{"code": "K7QM2XRA", "publicKey": "<publicKeyBase64>", "label": "Galaxy S25 Ultra"}
```

3. The answer is `201 {"ok": true, "deviceId": "..."}`. Store `deviceId` in EncryptedSharedPreferences.
   Errors: `401` wrong or expired code, `409` five phones already paired, `429` too many tries.

## 3. Sign every SMS request

```kotlin
val body = json.toByteArray(Charsets.UTF_8)        // the exact bytes you will send
val time = System.currentTimeMillis().toString()
val nonce = Base64.encodeToString(ByteArray(18).also { SecureRandom().nextBytes(it) },
    Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)   // 24 characters
val prefix = "PAYTRACE-SMS-v1\n$deviceId\n$time\n$nonce\n".toByteArray(Charsets.UTF_8)

val key = (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    .getEntry("paytrace-device", null) as KeyStore.PrivateKeyEntry).privateKey
val signature = Signature.getInstance("SHA256withECDSA").run {
    initSign(key); update(prefix); update(body); sign()        // DER, which the server expects
}

request.header("x-paytrace-device-id", deviceId)
       .header("x-paytrace-time", time)
       .header("x-paytrace-nonce", nonce)
       .header("x-paytrace-signature", Base64.encodeToString(signature, Base64.NO_WRAP))
       .post(body.toRequestBody("application/json".toMediaType()))
```

Rules the server enforces:

| Check | Refused with |
| --- | --- |
| Any signature header missing or malformed | 401 |
| Time more than 5 minutes from the server's clock | 401 |
| Unknown or removed device | 401 |
| More than 30 requests a minute from one device | 429 |
| Body over 4 KB | 413 |
| Signature does not match the exact body bytes | 401 |
| Same nonce seen in the last 10 minutes | 409 |

Send the body bytes you signed, unchanged. Do not pretty-print or re-encode after signing.

## 4. Where the SMS go

A signed phone's messages are stored in its owner's own data (`LiveProfile` of their Google account), so they appear on that person's dashboard and nobody else's.

The old shared pairing code (`x-paytrace-device`) still works until every phone has this update. Then set `PAYTRACE_ALLOW_DEVICE_CODE=false` in `.env.local` (card S11).

## App-usage reports (card M3)

`POST /api/ingest/usage` takes a usage report from a paired phone. It is
**signed only** (the old `x-paytrace-device` code is never accepted) with the
same headers and key, but the signed bytes start with `PAYTRACE-USAGE-v1`
instead of `PAYTRACE-SMS-v1`, so an SMS signature can never be replayed as a
usage report or the other way round.

Body (at most 8 KB, 40 apps):

```json
{"windowStart":"2026-05-26","apps":[{"package":"com.spotify.music","merchant":"SPOTIFY","lastUsed":"2026-09-01","minutes30d":3}]}
```

- The phone reports only apps in `android/.../KnownApps.kt` (known paid
  subscription apps), and only after the person switches on Settings > Usage
  access and the switch in the app.
- `lastUsed` is the day the app was last opened, or `null` if it was not
  opened since `windowStart` (the first day the phone has usage statistics
  for, at most 180 days back).
- The server matches `merchant` to the owner's own `LiveSubscription` by name
  (`db/neo4j/app-usage.ts`) and sets `lastVerifiedUsageAt` (source
  `android_usage_stats`), or `usageNoUseSince` when not opened. The unused
  warning reads these; a newer user-confirmed date is never overwritten.
