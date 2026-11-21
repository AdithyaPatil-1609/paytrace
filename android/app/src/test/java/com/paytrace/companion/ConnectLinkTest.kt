package com.paytrace.companion

import org.junit.Assert.*
import org.junit.Test

class ConnectLinkTest {
    private val token = "pt_and_8JPVfi_J7IQL7-7P5kqQG1vJ0ZLHdwZ4zMDjlXtCkyQ"

    @Test fun readsAnOfficialLink() {
        val r = ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in&token=$token")
        assertTrue(r is ConnectResult.Ok)
        val req = (r as ConnectResult.Ok).request
        assertEquals("https://paytrace.co.in", req.server)
        assertEquals(token, req.token)
        assertTrue(req.isOfficial)
    }

    @Test fun marksOtherServersAsNotOfficial() {
        val r = ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fabc.trycloudflare.com&token=$token")
        assertFalse((r as ConnectResult.Ok).request.isOfficial)
    }

    @Test fun refusesUnsafeServers() {
        val bad = listOf(
            "http%3A%2F%2Fpaytrace.co.in",
            "https%3A%2F%2Fpaytrace.co.in%2Fsteal",
            "https%3A%2F%2Fuser%40evil.com",
            "javascript%3Aalert(1)"
        )
        for (s in bad) {
            assertTrue(s, ConnectLink.parse("paytrace://connect?server=$s&token=$token") is ConnectResult.Bad)
        }
    }

    @Test fun refusesBadLinks() {
        assertTrue(ConnectLink.parse(null) is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("https://paytrace.co.in?token=$token") is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in") is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in&token=short") is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in&token=$token&token=$token") is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in&token=" + "x".repeat(700)) is ConnectResult.Bad)
    }

    @Test fun readsAPairLink() {
        val r = ConnectLink.parse("paytrace://pair?server=https%3A%2F%2Fpaytrace.co.in&code=abcd-efgh")
        val req = (r as ConnectResult.Ok).request
        assertTrue(req.isPairCode)
        assertEquals("ABCDEFGH", req.token)
        assertEquals("ABCD-EFGH", req.shownCode)
        assertTrue(req.isOfficial)
    }

    @Test fun refusesBadPairLinks() {
        val base = "paytrace://pair?server=https%3A%2F%2Fpaytrace.co.in"
        assertTrue(ConnectLink.parse(base) is ConnectResult.Bad)                       // no code
        assertTrue(ConnectLink.parse("$base&code=ABCD") is ConnectResult.Bad)          // too short
        assertTrue(ConnectLink.parse("$base&code=ABCD-EFG1") is ConnectResult.Bad)     // 1 is not used
        assertTrue(ConnectLink.parse("$base&code=ABCDEFGH&code=JKMNPQRS") is ConnectResult.Bad)
        assertTrue(ConnectLink.parse("paytrace://pair?server=http%3A%2F%2Fevil.com&code=ABCDEFGH") is ConnectResult.Bad)
    }
}
