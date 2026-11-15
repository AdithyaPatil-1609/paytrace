package com.paytrace.companion

// Sends one parsed payment event to the Paytrace laptop at /api/ingest/sms.
// It sends only the fields the parser read. The SMS text never leaves the phone.

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object EventSender {

    private const val PATH = "/api/ingest/sms"
    private const val TIMEOUT_MS = 10_000

    fun buildBody(payment: PaymentDetails): String {
        val json = JSONObject()
        json.put("source", "sms")
        json.put("kind", payment.kind)
        json.put("merchant", payment.merchant)
        // A cancelled mandate has no amount. Send null, never zero.
        if (payment.kind == "mandate_cancelled") {
            json.put("amountPaise", JSONObject.NULL)
        } else {
            json.put("amountPaise", payment.amountPaise)
        }
        json.put("date", payment.date)
        json.put("reference", payment.reference)
        return json.toString()
    }

    // The emulator reaches the laptop at http://10.0.2.2:3000.
    // A real phone must use the https:// tunnel address.
    fun isAllowedAddress(base: String): Boolean =
        base.startsWith("https://") || base.startsWith("http://10.0.2.2")

    // Returns null on success, or a short reason on failure.
    // Must run on a background thread.
    fun send(context: Context, payment: PaymentDetails): String? {
        val base = CompanionSettings.serverUrl(context)
        val code = CompanionSettings.pairingCode(context)

        if (base.isBlank()) return "Not sent: no laptop address saved"
        if (code.isBlank()) return "Not sent: no pairing code saved"
        if (!isAllowedAddress(base)) {
            return "Not sent: address must start with https:// " +
                    "(or http://10.0.2.2:3000 on the emulator)"
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

            connection.outputStream.use {
                it.write(buildBody(payment).toByteArray(Charsets.UTF_8))
            }

            val status = connection.responseCode
            when {
                status in 200..299 -> null
                status == 401 -> "Not sent: laptop refused the pairing code (401)"
                else -> "Not sent: laptop answered $status"
            }
        } catch (e: Exception) {
            "Not sent: could not reach the laptop (${e.javaClass.simpleName})"
        } finally {
            connection?.disconnect()
        }
    }

    // Sends on a background thread and updates the counters.
    fun sendAndRecord(
        context: Context,
        payment: PaymentDetails,
        finished: () -> Unit = {}
    ) {
        val appContext = context.applicationContext
        Thread {
            try {
                val error = send(appContext, payment)
                if (error == null) {
                    CompanionSettings.recordSent(
                        appContext,
                        "Sent: ${payment.kind} for ${payment.merchant}"
                    )
                    android.util.Log.d("PaytraceSMS", "Event sent to laptop")
                } else {
                    CompanionSettings.recordResult(appContext, error)
                    android.util.Log.d("PaytraceSMS", error)
                }
            } finally {
                finished()
            }
        }.start()
    }
}
