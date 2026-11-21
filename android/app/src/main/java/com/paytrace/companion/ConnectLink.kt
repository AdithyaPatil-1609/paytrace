package com.paytrace.companion

// Reads a "connect this phone" link from the Paytrace website. The website
// gives it as a QR code (on a laptop) or an "Open in Paytrace app" button
// (on a phone):
//   paytrace://pair?server=https%3A%2F%2Fpaytrace.co.in&code=ABCD-EFGH   (M2, signed)
//   paytrace://connect?server=https%3A%2F%2Fpaytrace.co.in&token=pt_and_...  (old token)
// Every part is checked here before the app may use it. The app still asks
// the user to confirm, because any website or app can open such a link.

import java.net.URI
import java.net.URLDecoder

// For a pair link, token holds the 8-character one-time code and isPairCode is true.
data class ConnectRequest(
    val server: String,
    val token: String,
    val isPairCode: Boolean = false
) {
    // The code as the website shows it: ABCD-EFGH.
    val shownCode: String
        get() = if (isPairCode && token.length == 8) token.take(4) + "-" + token.drop(4) else ""

    val host: String
        get() = try { URI(server).host ?: server } catch (e: Exception) { server }

    // Only paytrace.co.in is the official address. Anything else gets a warning.
    val isOfficial: Boolean
        get() = host.equals(ConnectLink.OFFICIAL_HOST, ignoreCase = true)
}

sealed class ConnectResult {
    data class Ok(val request: ConnectRequest) : ConnectResult()
    data class Bad(val reason: String) : ConnectResult()
}

object ConnectLink {

    const val OFFICIAL_HOST = "paytrace.co.in"
    private const val MAX_LINK_CHARS = 600
    private val tokenShape = Regex("""^pt_and_[A-Za-z0-9_-]{20,200}$""")

    fun parse(link: String?): ConnectResult {
        if (link.isNullOrBlank()) return ConnectResult.Bad("The link is empty")
        if (link.length > MAX_LINK_CHARS) return ConnectResult.Bad("The link is too long")

        val uri = try { URI(link.trim()) } catch (e: Exception) {
            return ConnectResult.Bad("This is not a Paytrace link")
        }
        if (!"paytrace".equals(uri.scheme, ignoreCase = true)) {
            return ConnectResult.Bad("This is not a Paytrace link")
        }
        val isPair = "pair".equals(uri.host, ignoreCase = true)
        if (!isPair && !"connect".equals(uri.host, ignoreCase = true)) {
            return ConnectResult.Bad("This is not a Paytrace connect link")
        }

        val params = query(uri.rawQuery)
            ?: return ConnectResult.Bad("This Paytrace link is damaged")
        val server = params["server"]?.trim()?.trimEnd('/')
            ?: return ConnectResult.Bad("The link has no server address")
        if (!isSafeServer(server)) {
            return ConnectResult.Bad("The server must be a plain https:// address, like https://paytrace.co.in")
        }
        if (isPair) {
            val code = SigningFormat.normalizeCode(params["code"])
                ?: return ConnectResult.Bad("The pairing code is missing or not 8 characters")
            return ConnectResult.Ok(ConnectRequest(server, code, isPairCode = true))
        }
        val token = params["token"]?.trim()
            ?: return ConnectResult.Bad("The link has no personal token")

        if (!tokenShape.matches(token)) {
            return ConnectResult.Bad("The personal token is not in the expected form")
        }
        return ConnectResult.Ok(ConnectRequest(server, token))
    }

    // https only (or http://10.0.2.2 on the emulator), with no user name,
    // path, query or fragment: just the site itself.
    fun isSafeServer(server: String): Boolean = try {
        val u = URI(server)
        val scheme = u.scheme?.lowercase()
        val plain = u.rawUserInfo == null && u.rawQuery == null && u.rawFragment == null &&
            (u.rawPath.isNullOrEmpty() || u.rawPath == "/")
        plain && !u.host.isNullOrBlank() &&
            (scheme == "https" || (scheme == "http" && u.host == "10.0.2.2"))
    } catch (e: Exception) { false }

    // Splits "a=1&b=2". A repeated name is refused, so a link cannot hide a
    // second server or token behind the first.
    private fun query(raw: String?): Map<String, String>? {
        if (raw.isNullOrEmpty()) return null
        val out = mutableMapOf<String, String>()
        for (pair in raw.split('&')) {
            if (pair.isEmpty()) continue
            val i = pair.indexOf('=')
            if (i <= 0) return null
            val name = URLDecoder.decode(pair.substring(0, i), "UTF-8")
            val value = URLDecoder.decode(pair.substring(i + 1), "UTF-8")
            if (out.containsKey(name)) return null
            out[name] = value
        }
        return out
    }
}
