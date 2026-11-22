package com.paytrace.companion

// Card M2. The exact formats Hanish's server checks (docs/security/DEVICE_SIGNING.md).
// Kept free of Android code, so the unit tests can check them on any computer.

object SigningFormat {

    // The phone signs these bytes, followed by the exact body bytes.
    // purpose is "SMS" for bank SMS and "USAGE" for app-usage reports (card M3),
    // so a signature made for one can never be replayed as the other.
    fun prefix(deviceId: String, time: String, nonce: String, purpose: String = "SMS"): ByteArray =
        "PAYTRACE-$purpose-v1\n$deviceId\n$time\n$nonce\n".toByteArray(Charsets.UTF_8)

    // What the server accepts for each header.
    val deviceIdShape = Regex("""^[A-Za-z0-9_-]{16,64}$""")
    val nonceShape = Regex("""^[A-Za-z0-9_-]{16,64}$""")

    // The pairing code shown on the account page: 8 characters from this
    // alphabet (no 0, 1, I, L or O, so it is easy to read and type).
    private const val CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    private const val CODE_LENGTH = 8

    // "k7qm-2xra" and "K7QM 2XRA" both become "K7QM2XRA". Anything else is null.
    fun normalizeCode(input: String?): String? {
        val code = input?.uppercase()?.replace(Regex("""[\s-]"""), "") ?: return null
        return if (code.length == CODE_LENGTH && code.all { it in CODE_ALPHABET }) code else null
    }
}
