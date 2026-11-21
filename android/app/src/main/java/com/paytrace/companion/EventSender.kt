package com.paytrace.companion

// Card M1. Sends one bank SMS to the server at /api/ingest/sms:
//   {"sender": "VM-HDFCBK-S", "text": "<masked SMS text>", "receivedAt": "<ISO time>"}
// The server's AI reads the text. The phone does not read payment fields.

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class OutgoingSms(
    val sender: String,
    val text: String,
    val receivedAt: String
)

object EventSender {

    private const val PATH = "/api/ingest/sms"
    private const val TIMEOUT_MS = 10_000

    fun buildBody(sms: OutgoingSms): String =
        JSONObject()
            .put("sender", sms.sender)
            .put("text", sms.text)
            .put("receivedAt", sms.receivedAt)
            .toString()

    // A real phone must use an https:// address.
    // The emulator may use http://10.0.2.2.
    fun isAllowedAddress(base: String): Boolean = try {
        val url = URL(base)
        url.userInfo == null && url.query == null && url.ref == null &&
            (url.protocol == "https" || (url.protocol == "http" && url.host == "10.0.2.2"))
    } catch (e: Exception) { false }

    private class Answer(val status: Int?, val error: String?)

    // Posts a body and returns the HTTP status, or a short error.
    // Must run on a background thread.
    private fun post(context: Context, body: String): Answer {
        val base = CompanionSettings.serverUrl(context)
        val code = CompanionSettings.pairingCode(context)
        if (base.isBlank()) return Answer(null, "Not sent: no server address saved")
        if (code.isBlank()) return Answer(null, "Not sent: no pairing code saved")
        if (!isAllowedAddress(base)) {
            return Answer(null, "Not sent: the address must start with https://")
        }
        var connection: HttpURLConnection? = null
        return try {
            connection = URL(base + PATH).openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("x-paytrace-device", code)
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            Answer(connection.responseCode, null)
        } catch (e: Exception) {
            Answer(null, "Not sent: could not reach the server (${e.javaClass.simpleName})")
        } finally {
            connection?.disconnect()
        }
    }

    // Returns null on success, or a short reason on failure.
    fun send(context: Context, sms: OutgoingSms): String? {
        val answer = post(context, buildBody(sms))
        answer.error?.let { return it }
        return when (val status = answer.status!!) {
            in 200..299 -> null
            401 -> "Not sent: the server refused the pairing code (401)"
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

    // Checks the address and the pairing code without sending any SMS.
    // An empty body is refused by the server, so nothing is stored.
    fun checkConnection(context: Context) {
        val appContext = context.applicationContext
        Thread {
            val answer = post(appContext, "{}")
            val message = when {
                answer.error != null -> answer.error
                answer.status == 401 -> "Server reached, but it refused the pairing code (401)"
                answer.status == 429 -> "Server reached, but it is limiting requests (429)"
                answer.status!! in 200..499 -> "Connection OK: server reached and pairing code accepted"
                else -> "Server reached, but it had an error (${answer.status})"
            }
            CompanionSettings.recordResult(appContext, message)
        }.start()
    }
}
