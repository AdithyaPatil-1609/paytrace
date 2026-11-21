package com.paytrace.companion

// Card M1. The phone no longer reads payment fields: the server's AI does.
// Before any text leaves the phone, this file:
//   1. drops OTP, PIN, CVV and password messages, and
//   2. masks account and card numbers to their last 4 digits.

object SmsParser {

    // Longest text we send. A long multi-part SMS is cut here.
    const val MAX_TEXT = 1000

    private val sensitive = Regex(
        """\b(OTP|PIN|CVV|password|passcode|verification[\s-]*code|one[\s-]*time[\s-]*password)\b""",
        RegexOption.IGNORE_CASE
    )

    // An account or card number written after a keyword,
    // for example "A/c XX1234", "a/c no. 123456789012", "card ending 4417".
    private val accountNumber = Regex(
        """\b(a/c|acct|account|card)(\s*(?:no\.?|number|ending(?:\s+(?:with|in))?)?\s*[:.#]?\s*)([Xx*\d][Xx*\d-]{3,})""",
        RegexOption.IGNORE_CASE
    )

    // A bare 13 to 19 digit number is treated as a card number.
    private val longNumber = Regex("""\b\d{13,19}\b""")

    // True when the message holds a one-time password, PIN, CVV or password.
    // Such a message must never leave the phone.
    fun isSensitive(message: String): Boolean =
        sensitive.containsMatchIn(message)

    // Keeps only the last 4 digits of every account and card number.
    fun maskAccounts(text: String): String {
        val keywordMasked = accountNumber.replace(text) { m ->
            val token = m.groupValues[3]
            val digits = token.filter { it.isDigit() }
            val last4 = if (digits.length >= 4) digits.takeLast(4) else token.takeLast(4)
            m.groupValues[1] + m.groupValues[2] + "XX" + last4
        }
        return longNumber.replace(keywordMasked) { "XX" + it.value.takeLast(4) }
    }
}
