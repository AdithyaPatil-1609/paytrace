package com.paytrace.companion

// Stops the same SMS from being sent twice (Android can deliver it twice).
// It keeps only short fingerprints, never the text.
// Two real payments with the same text but different times stay two.

import android.content.Context
import java.security.MessageDigest

object DuplicateDetector {

    private const val PREFS = "paytrace_seen_sms"
    private const val MAX_ENTRIES = 200

    private fun fingerprint(parts: Array<out String>): String {
        val bytes = MessageDigest
            .getInstance("SHA-256")
            .digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    @Synchronized
    fun markIfNew(context: Context, vararg parts: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = fingerprint(parts)
        val existing = prefs.getString("seen", "").orEmpty()
            .split(",")
            .filter { it.isNotBlank() }
        if (key in existing) return false
        val updated = (existing + key).takeLast(MAX_ENTRIES)
        return prefs.edit().putString("seen", updated.joinToString(",")).commit()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().clear().commit()
    }
}
