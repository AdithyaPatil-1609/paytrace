package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class BankSendersTest {
    @Test fun knownBankSenders() {
        assertEquals("HDFCBK", BankSenders.bankOf("VM-HDFCBK"))
        assertEquals("HDFCBK", BankSenders.bankOf("JD-HDFCBK-S"))
        assertEquals("ICICIB", BankSenders.bankOf("ax-icicib-t"))
        assertEquals("SBIINB", BankSenders.bankOf("SBIINB"))
    }

    @Test fun personalNumbersAreNotBanks() {
        assertNull(BankSenders.bankOf("+919876543210"))
        assertNull(BankSenders.bankOf("9876543210"))
        assertNull(BankSenders.bankOf(null))
        assertNull(BankSenders.bankOf(""))
    }

    @Test fun promotionalAndUnknownSendersAreRejected() {
        assertNull(BankSenders.bankOf("VM-HDFCBK-P"))
        assertNull(BankSenders.bankOf("VM-AMAZON"))
        assertNull(BankSenders.bankOf("VM-HDFCBK-S-X"))
    }
}
