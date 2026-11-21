package com.paytrace.companion

// Card M1. Receives each new SMS and, in this order:
//   1. drops it unread unless the sender is a registered bank or service sender;
//   2. drops OTP, PIN, CVV and password messages;
//   3. masks account and card numbers to the last 4 digits;
//   4. skips an exact repeat;
//   5. sends the sender, the masked text and the time to the server.

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.provider.Telephony
import androidx.compose.runtime.mutableStateOf
import java.time.Instant

data class ReceivedSms(val sender: String, val receivedAt: String)

// Remembers only who sent the last bank SMS and when. Never the text.
object LastSms {
    val latest = mutableStateOf<ReceivedSms?>(null)

    private const val PREFS = "paytrace_last_sms"

    fun save(context: Context, sms: ReceivedSms) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("sender", sms.sender)
            .putString("receivedAt", sms.receivedAt)
            .apply()
        latest.value = sms
    }

    fun load(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val sender = prefs.getString("sender", null)
        latest.value = if (sender != null) {
            ReceivedSms(sender, prefs.getString("receivedAt", "").orEmpty())
        } else {
            null
        }
    }
}

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "PaytraceSMS"
    }

    override fun onReceive(context: Context, intent: Intent) {

        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        // Never run this receiver in a release build.
        val debuggable =
            context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (!debuggable) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return

        // Rule 1: decide from the sender alone, BEFORE reading any text.
        val sender = messages.first().originatingAddress
        val oneSender = messages.all { it.originatingAddress == sender }
        if (sender == null || !oneSender || !BankSenders.isRegisteredSender(sender)) {
            // Show the sender ID, so a bank ID in an unexpected form can be spotted.
            // A personal phone number is never shown.
            val id = sender.orEmpty()
            val shown = when {
                id.isEmpty() -> "no sender"
                id.count { it.isDigit() } >= 7 -> "a phone number"
                else -> "\"" + id.take(20) + "\""
            }
            CompanionSettings.recordBlocked(context, "Ignored: not a registered bank sender ($shown)")
            android.util.Log.d(TAG, "Non-bank sender ignored unread: $shown")
            return
        }

        // Only now is the text read.
        val body = messages.joinToString("") { it.messageBody ?: "" }

        // Rule 2: a password message never leaves the phone.
        if (SmsParser.isSensitive(body)) {
            CompanionSettings.recordBlocked(context, "Blocked: OTP or password message")
            android.util.Log.d(TAG, "Sensitive message blocked")
            return
        }

        // Rule 3: mask account and card numbers, and cap the length.
        val masked = SmsParser.maskAccounts(body.trim()).take(SmsParser.MAX_TEXT)
        val receivedAt = Instant.ofEpochMilli(messages.first().timestampMillis).toString()

        // Rule 4: the same SMS delivered twice is sent once.
        if (!DuplicateDetector.markIfNew(context, sender, masked, receivedAt)) {
            android.util.Log.d(TAG, "Duplicate SMS ignored")
            return
        }

        LastSms.save(context, ReceivedSms(sender, receivedAt))

        // Rule 5: send to the server only when sending is switched on.
        if (CompanionSettings.sendingEnabled(context)) {
            val pending = goAsync()
            EventSender.sendAndRecord(context, OutgoingSms(sender, masked, receivedAt)) {
                pending.finish()
            }
        }
    }
}
