# Paytrace Companion (Android)

The Android app that sends bank SMS and app screen time to the person's Paytrace account. Package `com.paytrace.companion`, Android 8.0 (API 26) or newer, written in Kotlin with Jetpack Compose.

## What it does

- **Bank SMS:** `SmsReceiver.kt` listens for SMS, `BankSenders.kt` keeps only registered bank and payment senders, and `SmsParser.kt` reads the payment fields. Messages with an OTP, PIN or password are dropped on the phone and never sent.
- **Signed requests:** each phone has its own P-256 key (`DeviceKey.kt`) and signs every request (`SigningFormat.kt`, `EventSender.kt`). The server checks it in `lib/ingestion/device-auth.ts`. See `docs/security/DEVICE_SIGNING.md`.
- **Screen time:** with the person's permission (Settings → Usage access), `AppUsage.kt` reports when each paid app (`KnownApps.kt`) was last opened and the minutes in the last 30 days. Only app names and dates are sent, never what was done in the app.
- **Duplicates:** `DuplicateDetector.kt` stops the same SMS being sent twice.

## Pairing a phone

1. On paytrace.co.in, open **Add phone → Android** in the top bar and choose **Pair a phone**.
2. Open the app, enter the server address and the one-time code (it works once, for 10 minutes).
3. To unpair, use **Remove all paired phones** in the same menu.

## Building

Open the `android/` folder in Android Studio and run the `app` configuration, or from a terminal:

```sh
cd android
./gradlew assembleDebug
```

`laptop-receiver/receiver.mjs` is a stand-in for the server route, for testing the app against a laptop: `node android/laptop-receiver/receiver.mjs`.

Never commit real SMS, signing keys or `local.properties`.
