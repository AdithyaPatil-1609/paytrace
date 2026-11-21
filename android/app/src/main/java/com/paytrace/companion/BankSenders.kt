package com.paytrace.companion

// Decides from the sender ID alone whether an SMS can be a bank alert,
// so the app never reads the text of personal or promotional messages.
// Indian bank SMS arrive from IDs such as "VM-HDFCBK" or "JD-HDFCBK-S".

object BankSenders {

    // Bank sender IDs we support. Check this list against the sender shown
    // on the volunteer's phone before using it with real messages.
    val KNOWN = setOf("HDFCBK", "ICICIB", "SBIINB", "SBIPSG", "AXISBK", "KOTAKB")

    // Returns the bank ID, for example "HDFCBK", or null when the sender
    // is not a known bank. A personal phone number is never a bank.
    fun bankOf(sender: String?): String? {
        val parts = sender?.trim()?.uppercase()?.split('-') ?: return null
        if (parts.isEmpty() || parts.size > 3) return null
        // A final "-P" marks a promotional message. A bank alert is never promotional.
        if (parts.size >= 2 && parts.last() == "P") return null
        return parts.firstOrNull { it in KNOWN }
    }

    fun isBankSender(sender: String?): Boolean = bankOf(sender) != null
}
