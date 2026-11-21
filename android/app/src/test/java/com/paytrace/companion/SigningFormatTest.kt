package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class SigningFormatTest {
    @Test fun normalizesCodes() {
        assertEquals("ABCDEFGH", SigningFormat.normalizeCode("abcd-efgh"))
        assertEquals("ABCDEFGH", SigningFormat.normalizeCode(" ABCD EFGH "))
        assertNull(SigningFormat.normalizeCode(null))
        assertNull(SigningFormat.normalizeCode("ABCDEFG"))      // 7 characters
        assertNull(SigningFormat.normalizeCode("ABCDEFGO"))     // O is not in the alphabet
        assertNull(SigningFormat.normalizeCode("ABCDEFGHJ"))    // 9 characters
    }

    @Test fun buildsTheSignedPrefixExactly() {
        val p = String(SigningFormat.prefix("dev_1234567890abcdef", "1763700000000", "nonce_abcdefghijklmnop"), Charsets.UTF_8)
        assertEquals("PAYTRACE-SMS-v1\ndev_1234567890abcdef\n1763700000000\nnonce_abcdefghijklmnop\n", p)
    }
}
