
package com.paytrace.companion

import android.content.Context
import java.security.MessageDigest

object DuplicateDetector {

    private const val PREFS = "paytrace_seen_payments"
    private const val MAX_ENTRIES = 100

    private fun fingerprint(payment: PaymentDetails): String {

        val canonical = listOf(
            payment.kind,
            payment.merchant.trim().uppercase(),
            payment.amountPaise.toString(),
            payment.date,
            payment.reference.trim().uppercase()
        ).joinToString("|")


        val bytes = MessageDigest
            .getInstance("SHA-256")
            .digest(canonical.toByteArray(Charsets.UTF_8))

        return bytes.joinToString("") {
            "%02x".format(it.toInt() and 0xff)
        }
    }

    @Synchronized
    fun markIfNew(
        context: Context,
        payment: PaymentDetails
    ): Boolean {

        val prefs = context.getSharedPreferences(
            PREFS,
            Context.MODE_PRIVATE
        )

        val key = fingerprint(payment)

        val existing = prefs.getString("seen", "")
            .orEmpty()
            .split(",")
            .filter { it.isNotBlank() }

        if (key in existing) {
            return false
        }

        val updated = (existing + key)
            .takeLast(MAX_ENTRIES)

        return prefs.edit()
            .putString("seen", updated.joinToString(","))
            .commit()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(
            PREFS,
            Context.MODE_PRIVATE
        ).edit().clear().commit()
    }
}
