package com.paytrace.companion

// Phone-side settings for Live mode (Document 1, R3): where to send events,
// the pairing code, and the "Test sender only" safety switch.
// Also keeps the "sent" and "blocked" counters shown on the screen.

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateOf

object CompanionSettings {

    private const val PREFS = "paytrace_companion_settings"
    const val DEFAULT_TEST_SENDER = "15551234567"

    val sentCount = mutableStateOf(0)
    val blockedCount = mutableStateOf(0)
    val lastResult = mutableStateOf("Nothing sent yet")

    private val mainThread = Handler(Looper.getMainLooper())

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun serverUrl(context: Context): String =
        prefs(context).getString("server_url", "").orEmpty()

    fun pairingCode(context: Context): String =
        prefs(context).getString("pairing_code", "").orEmpty()

    fun testSender(context: Context): String =
        prefs(context).getString("test_sender", DEFAULT_TEST_SENDER).orEmpty()

    // Stays ON until real data is approved at Mentor Round 1.
    fun testSenderOnly(context: Context): Boolean =
        prefs(context).getBoolean("test_sender_only", true)

    fun sendingEnabled(context: Context): Boolean =
        prefs(context).getBoolean("sending_enabled", false)

    fun save(
        context: Context,
        serverUrl: String,
        pairingCode: String,
        testSender: String,
        testSenderOnly: Boolean,
        sendingEnabled: Boolean
    ) {
        prefs(context).edit()
            .putString("server_url", serverUrl.trim().trimEnd('/'))
            .putString("pairing_code", pairingCode.trim())
            .putString("test_sender", testSender.trim())
            .putBoolean("test_sender_only", testSenderOnly)
            .putBoolean("sending_enabled", sendingEnabled)
            .commit()
    }

    fun load(context: Context) {
        val p = prefs(context)
        val sent = p.getInt("sent", 0)
        val blocked = p.getInt("blocked", 0)
        val last = p.getString("last_result", "Nothing sent yet").orEmpty()
        mainThread.post {
            sentCount.value = sent
            blockedCount.value = blocked
            lastResult.value = last
        }
    }

    @Synchronized
    fun recordSent(context: Context, message: String) {
        val p = prefs(context)
        val sent = p.getInt("sent", 0) + 1
        p.edit().putInt("sent", sent).putString("last_result", message).commit()
        mainThread.post {
            sentCount.value = sent
            lastResult.value = message
        }
    }

    @Synchronized
    fun recordBlocked(context: Context, message: String) {
        val p = prefs(context)
        val blocked = p.getInt("blocked", 0) + 1
        p.edit().putInt("blocked", blocked).putString("last_result", message).commit()
        mainThread.post {
            blockedCount.value = blocked
            lastResult.value = message
        }
    }

    fun recordResult(context: Context, message: String) {
        prefs(context).edit().putString("last_result", message).commit()
        mainThread.post { lastResult.value = message }
    }

    fun resetCounters(context: Context) {
        prefs(context).edit()
            .putInt("sent", 0)
            .putInt("blocked", 0)
            .putString("last_result", "Counters reset")
            .commit()
        load(context)
    }

    // Banks write numbers as "+91 98...", "98..." or "VM-HDFCBK".
    // For phone numbers we compare the last 10 digits.
    fun isTestSender(context: Context, sender: String?): Boolean {
        val expected = testSender(context)
        if (sender.isNullOrBlank() || expected.isBlank()) return false
        val a = sender.filter { it.isDigit() }
        val b = expected.filter { it.isDigit() }
        if (a.isEmpty() || b.isEmpty()) {
            return sender.trim().equals(expected.trim(), ignoreCase = true)
        }
        return a.takeLast(10) == b.takeLast(10)
    }
}
