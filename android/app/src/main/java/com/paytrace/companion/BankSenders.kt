package com.paytrace.companion

// Card M1. Decides from the sender ID alone whether an SMS may be read.
// Only registered business senders pass, in the TRAI format:
// a 2-letter prefix, the header, and -S (service) or -T (transactional),
// for example "VM-HDFCBK-S". Normal phone numbers are dropped unread,
// so a personal number cannot pretend to be a bank.

object BankSenders {

    private val registered = Regex("""^[A-Z]{2}-[A-Z0-9]{3,9}-[ST]$""")

    // Returns the header, for example "HDFCBK", or null when the sender
    // is not a registered service or transactional sender.
    fun headerOf(sender: String?): String? {
        val id = sender?.trim()?.uppercase() ?: return null
        if (!registered.matches(id)) return null
        return id.split('-')[1]
    }

    fun isRegisteredSender(sender: String?): Boolean = headerOf(sender) != null
}
