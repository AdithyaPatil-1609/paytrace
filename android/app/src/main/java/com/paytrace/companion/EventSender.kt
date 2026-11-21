package com.paytrace.companion

// Cards M1 and M2. Sends one bank SMS to the server at /api/ingest/sms:
//   {"sender": "VM-HDFCBK-S", "text": "<masked SMS text>", "receivedAt": "<ISO time>"}
// A paired phone signs every request with its Keystore key (M2):
//   headers x-paytrace-device-id, x-paytrace-time, x-paytrace-nonce, x-paytrace-signature
// over the bytes "PAYTRACE-SMS-v1\n" + deviceId + "\n" + time + "\n" + nonce + "\n" + body.
// A phone that is not paired yet falls back to the old shared code (x-paytrace-device).

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class OutgoingSms(
    val sender: String,
    val text: String,
    val receivedAt: String
)

object EventSender {

    private const val SMS_PATH = "/api/ingest/sms"
    private const val PAIR_PATH = "/api/devices/pair"
    private const val TIMEOUT_MS = 10_000

    fun buildBody(sms: OutgoingSms): String =
        JSONObject()
            .put("sender", sms.sender)
            .put("text", sms.text)
            .put("receivedAt", sms.receivedAt)
            .toString()

    fun isAllowedAddress(base: String): Boolean = ConnectLink.isSafeServer(base)

    private class Answer(val status: Int?, val body: String, val error: String?)

    // Opens a POST, adds headers, sends the exact bytes, and reads the answer.
    // Must run on a background thread.
    private fun postBytes(url: String, bytes: ByteArray, headers: Map<String, String>): Answer {
        var connection: HttpURLConnection? = null
        return try {
            connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText().take(2000) }.orEmpty()
            Answer(status, text, null)
        } catch (e: Exception) {
            Answer(null, "", "Not sent: could not reach the server (${e.javaClass.simpleName})")
        } finally {
            connection?.disconnect()
        }
    }

    // Sends an SMS body: signed when the phone is paired, else with the old code.
    private fun postSms(context: Context, body: String): Answer {
        val base = CompanionSettings.serverUrl(context)
        if (base.isBlank()) return Answer(null, "", "Not sent: no server address saved")
        if (!isAllowedAddress(base)) {
            return Answer(null, "", "Not sent: the address must be a plain https:// address")
        }
        val bytes = body.toByteArray(Charsets.UTF_8)
        val deviceId = DevicePairing.deviceIdFor(context, base)
        val headers = if (deviceId != null) {
            val time = System.currentTimeMillis().toString()
            val nonce = DeviceKey.newNonce()
            val signature = try {
                DeviceKey.sign(SigningFormat.prefix(deviceId, time, nonce) + bytes)
            } catch (e: Exception) {
                return Answer(null, "", "Not sent: this phone's key is missing. Pair the phone again.")
            }
            mapOf(
                "x-paytrace-device-id" to deviceId,
                "x-paytrace-time" to time,
                "x-paytrace-nonce" to nonce,
                "x-paytrace-signature" to signature
            )
        } else {
            val code = CompanionSettings.pairingCode(context)
            if (code.isBlank()) return Answer(null, "", "Not sent: this phone is not paired yet")
            mapOf("x-paytrace-device" to code)
        }
        return postBytes(base + SMS_PATH, bytes, headers)
    }

    // Returns null on success, or a short reason on failure.
    fun send(context: Context, sms: OutgoingSms): String? {
        val answer = postSms(context, buildBody(sms))
        answer.error?.let { return it }
        return when (val status = answer.status!!) {
            in 200..299 -> null
            401 -> "Not sent: the server refused this phone (401). Pair it again."
            409 -> "Not sent: the server saw this request already (409)"
            413 -> "Not sent: the message is too large (413)"
            429 -> "Not sent: too many messages, try again in a minute (429)"
            else -> "Not sent: the server answered $status"
        }
    }

    // Sends on a background thread and updates the counters.
    fun sendAndRecord(context: Context, sms: OutgoingSms, finished: () -> Unit = {}) {
        val appContext = context.applicationContext
        Thread {
            try {
                val error = send(appContext, sms)
                if (error == null) {
                    CompanionSettings.recordSent(appContext, "Sent: SMS from ${sms.sender}")
                    android.util.Log.d("PaytraceSMS", "SMS sent to server")
                } else {
                    CompanionSettings.recordResult(appContext, error)
                    android.util.Log.d("PaytraceSMS", error)
                }
            } finally {
                finished()
            }
        }.start()
    }

    // Checks the address and the pairing without sending any SMS.
    // An empty body passes the signature check but is then refused (400),
    // so nothing is stored.
    fun checkConnection(context: Context) {
        val appContext = context.applicationContext
        Thread {
            val signed = DevicePairing.deviceIdFor(appContext, CompanionSettings.serverUrl(appContext)) != null
            val answer = postSms(appContext, "{}")
            val message = when {
                answer.error != null -> answer.error
                answer.status == 401 -> "Server reached, but it refused this phone (401). Pair it again."
                answer.status == 429 -> "Server reached, but it is limiting requests (429)"
                answer.status!! in 200..499 ->
                    if (signed) "Connection OK: signed request accepted" else "Connection OK (old shared code)"
                else -> "Server reached, but it had an error (${answer.status})"
            }
            CompanionSettings.recordResult(appContext, message)
        }.start()
    }

    // Pairs this phone: sends the one-time code from the account page and the
    // phone's public key. On success, saves the device id and checks the connection.
    fun pair(context: Context, server: String, rawCode: String) {
        val appContext = context.applicationContext
        Thread {
            val message = pairNow(appContext, server.trim().trimEnd('/'), rawCode)
            CompanionSettings.recordResult(appContext, message)
            if (message.startsWith("Paired")) checkConnection(appContext)
        }.start()
    }

    private fun pairNow(context: Context, server: String, rawCode: String): String {
        if (!isAllowedAddress(server)) return "Not paired: the address must be a plain https:// address"
        val code = SigningFormat.normalizeCode(rawCode)
            ?: return "Not paired: enter the 8-character code from your account page"
        val publicKey = try { DeviceKey.publicKeyBase64() } catch (e: Exception) {
            return "Not paired: could not make this phone's key (${e.javaClass.simpleName})"
        }
        val body = JSONObject()
            .put("code", code)
            .put("publicKey", publicKey)
            .put("label", Build.MODEL.take(40))
            .toString()
        val answer = postBytes(server + PAIR_PATH, body.toByteArray(Charsets.UTF_8), emptyMap())
        answer.error?.let { return it.replace("Not sent", "Not paired") }
        return when (answer.status) {
            201, 200 -> {
                val deviceId = try { JSONObject(answer.body).optString("deviceId") } catch (e: Exception) { "" }
                if (!SigningFormat.deviceIdShape.matches(deviceId)) {
                    "Not paired: the server's answer was not understood"
                } else {
                    DevicePairing.save(context, server, deviceId)
                    CompanionSettings.save(
                        context, server, CompanionSettings.pairingCode(context),
                        CompanionSettings.testSender(context),
                        CompanionSettings.testSenderOnly(context), true
                    )
                    ConnectInbox.settingsChanged()
                    "Paired with ${ConnectRequest(server, code).host}"
                }
            }
            401 -> "Not paired: the code is wrong or expired. Make a new one on the website."
            409 -> "Not paired: too many phones on this account. Remove one on the website."
            429 -> "Not paired: too many tries. Wait a minute."
            else -> "Not paired: the server answered ${answer.status}"
        }
    }
}
