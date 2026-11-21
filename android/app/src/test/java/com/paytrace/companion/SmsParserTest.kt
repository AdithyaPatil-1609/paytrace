package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class SmsParserTest {
    @Test fun dropsSensitiveMessages() {
        assertTrue(SmsParser.isSensitive("Your OTP is 482913. Do not share it."))
        assertTrue(SmsParser.isSensitive("Use PIN 4512 to log in"))
        assertFalse(SmsParser.isSensitive("Rs 649 debited from A/c XX2291 for NETFLIX"))
    }

    @Test fun masksAccountNumbers() {
        assertEquals(
            "Rs 649 debited from A/c XX9012 on 21-11-26",
            SmsParser.maskAccounts("Rs 649 debited from A/c 123456789012 on 21-11-26")
        )
        assertEquals(
            "INR 199 spent on card ending XX4417 at SPOTIFY",
            SmsParser.maskAccounts("INR 199 spent on card ending 4417 at SPOTIFY")
        )
        assertEquals(
            "Debited from a/c no. XX5678",
            SmsParser.maskAccounts("Debited from a/c no. 0012345678")
        )
    }

    @Test fun masksBareCardNumbers() {
        assertEquals("Card XX1111 charged", SmsParser.maskAccounts("Card 4111111111111111 charged"))
    }

    @Test fun keepsReferencesAndAmounts() {
        val text = "Rs.199.00 debited. UPI Ref 712003344556. Avl bal Rs 5,000"
        assertEquals(text, SmsParser.maskAccounts(text))
    }
}
