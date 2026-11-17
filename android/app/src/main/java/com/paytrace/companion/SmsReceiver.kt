package com.paytrace.companion

// Receives each new SMS, keeps only payment alerts, drops password messages,
// applies the "Test sender only" switch, and sends the parsed event to the laptop.

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.provider.Telephony
import androidx.compose.runtime.mutableStateOf

object PaymentInbox {
    val latest = mutableStateOf<PaymentDetails?>(null)

    private const val PREFS = "paytrace_test_inbox"

    fun save(context: Context, payment: PaymentDetails) {
        // Store only the extracted fields, never the SMS text.
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("merchant", payment.merchant)
            .putLong("amount", payment.amountPaise)
            .putString("date", payment.date)
            .putString("reference", payment.reference)
            .putString("kind", payment.kind)
            .apply()

        latest.value = payment
    }

    fun load(context: Context) {
        val prefs = context.getSharedPreferences(
            PREFS, Context.MODE_PRIVATE
        )

        val merchant = prefs.getString("merchant", null)

        latest.value = if (merchant != null) {
            PaymentDetails(
                merchant = merchant,
                amountPaise = prefs.getLong("amount", 0),
                date = prefs.getString("date", "") ?: "",
                reference = prefs.getString("reference", "") ?: "",
                kind = prefs.getString("kind", "debit_posted") ?: "debit_posted"
            )
        } else {
            null
        }
    }

    fun clear(context: Context) {
        context.getSharedPreferences(
            PREFS, Context.MODE_PRIVATE
        ).edit().clear().apply()

        latest.value = null
    }
}

class SmsReceiver : BroadcastReceiver() {

    companion object {
        const val TEST_PREFIX = "PAYTRACE_TEST "
        private const val TAG = "PaytraceSMS"
    }

    override fun onReceive(context: Context, intent: Intent) {

        if (intent.action !=
            Telephony.Sms.Intents.SMS_RECEIVED_ACTION
        ) return

        // Never run this receiver in a release build.
        val debuggable =
            context.applicationInfo.flags and
                    ApplicationInfo.FLAG_DEBUGGABLE != 0

        if (!debuggable) return

        val messages =
            Telephony.Sms.Intents.getMessagesFromIntent(intent)

        if (messages.isEmpty()) return

        val body = messages.joinToString("") {
            it.messageBody ?: ""
        }

        // Rule 1: a password message never leaves the phone (Test A).
        if (SmsParser.isSensitive(body)) {
            CompanionSettings.recordBlocked(
                context,
                "Blocked: password or OTP message"
            )
            android.util.Log.d(TAG, "Sensitive message blocked")
            return
        }

        // Rule 2: while "Test sender only" is on, every other sender
        // is ignored, including a real bank (Test C).
        if (CompanionSettings.testSenderOnly(context)) {
            val allFromTestSender = messages.all {
                CompanionSettings.isTestSender(context, it.originatingAddress)
            }
            if (!allFromTestSender) {
                CompanionSettings.recordBlocked(
                    context,
                    "Blocked: not the test sender"
                )
                android.util.Log.d(TAG, "Message from other sender blocked")
                return
            }
        }

        // Rule 3: keep only messages that read as a payment alert.
        val text = body.removePrefix(TEST_PREFIX)
        val payment = SmsParser.parse(text, messages.first().originatingAddress) ?: return

        // Rule 4: the same alert twice is handled once.
        val isNew = DuplicateDetector.markIfNew(context, payment)

        if (!isNew) {
            android.util.Log.d(TAG, "Duplicate test payment ignored")
            return
        }

        PaymentInbox.save(context, payment)
        android.util.Log.d(TAG, "New synthetic payment saved")

        // Rule 5: send to the laptop only when sending is switched on (Test B).
        if (CompanionSettings.sendingEnabled(context)) {
            val pending = goAsync()
            EventSender.sendAndRecord(context, payment) {
                pending.finish()
            }
        }
    }
}
