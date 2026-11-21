
package com.paytrace.companion

import java.time.LocalDate

data class PaymentDetails(
    val merchant: String,
    val amountPaise: Long,
    val date: String,
    val reference: String,
    val kind: String = "debit_posted",
    val accountHint: String? = null
)

object SmsParser {

    private val sensitive = Regex(
        """\b(OTP|PIN|CVV|password|verification[\s-]*code|one[\s-]*time[\s-]*password)\b""",
        RegexOption.IGNORE_CASE
    )

    // Synthetic debit SMS
    private val debitPattern = Regex(
        """^Rs\.\s*(\d+(?:\.\d{1,2})?)\s+debited from A/c XX\d{4} for ([A-Za-z0-9 ]+) on (\d{2}-\d{2}-\d{4})\. Ref: ([A-Za-z0-9]+)\.$""",
        RegexOption.IGNORE_CASE
    )

    // Synthetic mandate creation SMS
    private val createdPattern = Regex(
        """^Autopay mandate created for ([A-Za-z0-9 ]+) Rs\.\s*(\d+(?:\.\d{1,2})?) on (\d{2}-\d{2}-\d{4})\. Ref: ([A-Za-z0-9]+)\.$""",
        RegexOption.IGNORE_CASE
    )

    // Synthetic mandate cancellation SMS
    private val cancelledPattern = Regex(
        """^Autopay mandate cancelled for ([A-Za-z0-9 ]+) on (\d{2}-\d{2}-\d{4})\. Ref: ([A-Za-z0-9]+)\.$""",
        RegexOption.IGNORE_CASE
    )

    // Synthetic upcoming debit SMS
    private val scheduledPattern = Regex(
        """^Rs\.\s*(\d+(?:\.\d{1,2})?)\s+scheduled for ([A-Za-z0-9 ]+) on (\d{2}-\d{2}-\d{4})\. Ref: ([A-Za-z0-9]+)\.$""",
        RegexOption.IGNORE_CASE
    )

    // Synthetic failed debit SMS
    private val failedPattern = Regex(
        """^Rs\.\s*(\d+(?:\.\d{1,2})?)\s+debit failed for ([A-Za-z0-9 ]+) on (\d{2}-\d{2}-\d{4})\. Ref: ([A-Za-z0-9]+)\.$""",
        RegexOption.IGNORE_CASE
    )

    private fun parseAmount(text: String): Long? {
        val amount = text.toBigDecimalOrNull()
            ?: return null

        return try {
            val paise = amount.movePointRight(2)
                .longValueExact()

            if (paise > 0L) paise else null
        } catch (e: ArithmeticException) {
            null
        }
    }

    private fun parseDate(text: String): String? {
        val parts = text.split("-")
        if (parts.size != 3) return null

        val isoDate =
            "${parts[2]}-${parts[1]}-${parts[0]}"

        return try {
            LocalDate.parse(isoDate).toString()
        } catch (e: Exception) {
            null
        }
    }

    // True when the message holds a one-time password, PIN, CVV or password.
    // Such a message must never leave the phone.
    fun isSensitive(message: String): Boolean =
        sensitive.containsMatchIn(message)

    fun parse(message: String, sender: String? = null): PaymentDetails? {

        if (message.length > 500) return null

        if (sensitive.containsMatchIn(message)) {
            return null
        }

        val text = message.trim()

        // 1. Successful debit
        debitPattern.matchEntire(text)?.let { match ->

            return PaymentDetails(
                merchant = match.groupValues[2].trim(),
                amountPaise = parseAmount(
                    match.groupValues[1]
                ) ?: return null,
                date = parseDate(
                    match.groupValues[3]
                ) ?: return null,
                reference = match.groupValues[4],
                kind = "debit_posted"
            )
        }

        // 2. Mandate created
        createdPattern.matchEntire(text)?.let { match ->

            return PaymentDetails(
                merchant = match.groupValues[1].trim(),
                amountPaise = parseAmount(
                    match.groupValues[2]
                ) ?: return null,
                date = parseDate(
                    match.groupValues[3]
                ) ?: return null,
                reference = match.groupValues[4],
                kind = "mandate_created"
            )
        }

        // 3. Mandate cancelled
        cancelledPattern.matchEntire(text)?.let { match ->

            return PaymentDetails(
                merchant = match.groupValues[1].trim(),
                amountPaise = 0L,
                date = parseDate(
                    match.groupValues[2]
                ) ?: return null,
                reference = match.groupValues[3],
                kind = "mandate_cancelled"
            )
        }

        // 4. Upcoming debit
        scheduledPattern.matchEntire(text)?.let { match ->

            return PaymentDetails(
                merchant = match.groupValues[2].trim(),
                amountPaise = parseAmount(
                    match.groupValues[1]
                ) ?: return null,
                date = parseDate(
                    match.groupValues[3]
                ) ?: return null,
                reference = match.groupValues[4],
                kind = "debit_scheduled"
            )
        }

        // 5. Failed debit
        failedPattern.matchEntire(text)?.let { match ->

            return PaymentDetails(
                merchant = match.groupValues[2].trim(),
                amountPaise = parseAmount(
                    match.groupValues[1]
                ) ?: return null,
                date = parseDate(
                    match.groupValues[3]
                ) ?: return null,
                reference = match.groupValues[4],
                kind = "debit_failed"
            )
        }

        return parseBankDebit(text, sender)
    }

    // Strict, opt-in debit formats; no arbitrary sender, credit, or OTP parsing.
    private fun parseBankDebit(text: String, sender: String?): PaymentDetails? {
        val bank = BankSenders.bankOf(sender) ?: return null
        if (Regex("""\b(credited|refunded|failed|declined|scheduled|reversed)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text)) return null
        if (!Regex("""\b(debited|spent|paid)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text)) return null
        val options = RegexOption.IGNORE_CASE
        val amount = Regex("""(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)""", options).find(text)?.groupValues?.get(1)?.replace(",", "") ?: return null
        val masked = Regex("""(?:A/c|account|card)\s*(?:ending\s*(?:with|in)?\s*)?[Xx*]+\s*(\d{4})\b""", options).find(text)?.groupValues?.get(1) ?: return null
        val merchant = Regex("""(?:\bfor\b|\bat\b|\bto\b|\bVPA\b)\s+([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79}?)(?=\s+(?:on\s+\d|Ref\b|UPI\s+Ref\b|UTR\b|RRN\b|Txn\b)|[;\n]|$)""", options).find(text)?.groupValues?.get(1)?.trim()?.trimEnd('.') ?: return null
        val reference = Regex("""\b(?:UPI\s+Ref(?:\s+No)?|Ref(?:erence)?(?:\s+No)?|UTR|RRN|Txn\s+ID)\s*[:#.-]?\s*([A-Za-z0-9-]{3,80})\b""", options).find(text)?.groupValues?.get(1) ?: return null
        val numericDate = Regex("""\b(\d{2})[-/](\d{2})[-/](\d{4}|\d{2})\b""").find(text)
        val date = if (numericDate != null) {
            val (day, month, year) = numericDate.destructured
            parseDate("$day-$month-${if (year.length == 2) "20$year" else year}")
        } else {
            val named = Regex("""\b(\d{2})-([A-Za-z]{3})-(\d{4}|\d{2})\b""").find(text) ?: return null
            val (day, month, year) = named.destructured
            val monthNumber = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC").indexOf(month.uppercase()) + 1
            if (monthNumber == 0) return null
            parseDate("$day-${monthNumber.toString().padStart(2, '0')}-${if (year.length == 2) "20$year" else year}")
        } ?: return null
        return PaymentDetails(merchant, parseAmount(amount) ?: return null, date, reference, "debit_posted", "$bank-$masked")
    }
}
