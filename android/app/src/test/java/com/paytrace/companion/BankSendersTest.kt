package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class BankSendersTest {
    @Test fun registeredSendersPass() {
        assertEquals("HDFCBK", BankSenders.headerOf("VM-HDFCBK-S"))
        assertEquals("ICICIT", BankSenders.headerOf("ax-icicit-t"))
        assertEquals("SBIUPI", BankSenders.headerOf("JD-SBIUPI-S"))
    }

    @Test fun normalNumbersAreDropped() {
        assertNull(BankSenders.headerOf("+919876543210"))
        assertNull(BankSenders.headerOf("9876543210"))
        assertNull(BankSenders.headerOf(null))
        assertNull(BankSenders.headerOf(""))
    }

    @Test fun promotionalAndOldFormatsAreDropped() {
        assertNull(BankSenders.headerOf("VM-HDFCBK-P"))
        assertNull(BankSenders.headerOf("VM-HDFCBK"))
        assertNull(BankSenders.headerOf("HDFCBK"))
        assertNull(BankSenders.headerOf("VM-HDFCBK-S-X"))
    }
}
