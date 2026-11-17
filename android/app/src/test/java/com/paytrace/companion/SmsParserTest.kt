package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class SmsParserTest {
    @Test fun maskedBankDebit() {
        val text = "Rs. 199.00 debited from A/c XX1234 for Netflix on 15-11-2026. Ref: ABC123."
        val event = SmsParser.parse(text, "VM-HDFCBK-S")
        assertNotNull(event)
        assertEquals(19900L, event!!.amountPaise)
        assertEquals("Netflix", event.merchant)
    }
    @Test fun namedMonthDebit() {
        val text = "INR 499.00 spent on card XX1234 at NETFLIX on 15-Nov-26 Ref: 123456."
        val event = SmsParser.parse(text, "VM-ICICIB-S")
        assertNotNull(event)
        assertEquals("ICICIB-1234", event!!.accountHint)
        assertEquals("2026-11-15", event.date)
        assertNull(SmsParser.parse(text, "unknown"))
    }
    @Test fun rejectsSensitive() {
        assertNull(SmsParser.parse("OTP 123456 for INR 499", "VM-HDFCBK-S"))
    }
}
