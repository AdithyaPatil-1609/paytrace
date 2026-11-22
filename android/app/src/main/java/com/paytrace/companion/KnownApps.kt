package com.paytrace.companion

// Card M3. The only apps whose usage the phone ever reads: well-known paid
// subscription apps, each with the name Paytrace uses for its payments.
// The server matches the name to the person's own subscriptions; an app with
// no matching subscription changes nothing. Keep this list in step with the
// <queries> list in AndroidManifest.xml.

data class KnownApp(val packageName: String, val merchant: String)

object KnownApps {
    val all = listOf(
        KnownApp("com.netflix.mediaclient", "NETFLIX"),
        KnownApp("com.spotify.music", "SPOTIFY"),
        KnownApp("in.startv.hotstar", "HOTSTAR"),
        KnownApp("com.amazon.avod.thirdpartyclient", "AMAZON PRIME"),
        KnownApp("com.google.android.apps.youtube.music", "YOUTUBE MUSIC"),
        KnownApp("com.google.android.youtube", "YOUTUBE"),
        KnownApp("com.jio.media.ondemand", "JIOCINEMA"),
        KnownApp("com.sonyliv", "SONYLIV"),
        KnownApp("com.graymatrix.did", "ZEE5"),
        KnownApp("com.google.android.apps.subscriptions.red", "GOOGLE ONE"),
        KnownApp("com.linkedin.android", "LINKEDIN"),
        KnownApp("com.duolingo", "DUOLINGO"),
        KnownApp("com.apple.android.music", "APPLE MUSIC"),
        KnownApp("com.audible.application", "AUDIBLE"),
        KnownApp("in.swiggy.android", "SWIGGY"),
        KnownApp("com.application.zomato", "ZOMATO"),
        KnownApp("com.openai.chatgpt", "CHATGPT"),
        KnownApp("com.canva.editor", "CANVA"),
        KnownApp("com.dropbox.android", "DROPBOX"),
        KnownApp("com.microsoft.office.officehubrow", "MICROSOFT 365"),
        KnownApp("com.bsbportal.music", "WYNK"),
        KnownApp("com.jio.media.jiobeats", "JIOSAAVN"),
        KnownApp("com.gaana", "GAANA"),
        KnownApp("com.tinder", "TINDER"),
        KnownApp("com.medium.reader", "MEDIUM")
    )
}
