package com.paytrace.companion

// The one screen of the Paytrace Companion app.
// It shows the SMS permission, the server connection and the counters.
// The phone does not read payment fields: it sends the bank SMS text,
// with account numbers masked, and the server's AI reads it.
//
// Connecting is one scan or one tap: the website shows a QR code or an
// "Open in Paytrace app" link (see ConnectLink.kt). The app always asks
// the user to confirm the server before it saves anything.

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.paytrace.companion.ui.theme.PaytraceCompanionTheme

// Holds a connect request until the user confirms or cancels it.
object ConnectInbox {
    val pending = mutableStateOf<ConnectRequest?>(null)
    val notice = mutableStateOf("")
    // Goes up whenever the saved settings change, so the fields reload.
    val version = mutableStateOf(0)

    fun receive(link: String?) {
        when (val result = ConnectLink.parse(link)) {
            is ConnectResult.Ok -> {
                pending.value = result.request
                notice.value = ""
            }
            is ConnectResult.Bad -> {
                pending.value = null
                notice.value = "Not connected: ${result.reason}"
            }
        }
    }

    // Called from background threads after pairing: reloads the fields on the main thread.
    fun settingsChanged() {
        Handler(Looper.getMainLooper()).post { version.value += 1 }
    }

    fun confirm(context: Context, request: ConnectRequest) {
        if (request.isPairCode) {
            pending.value = null
            notice.value = "Pairing with ${request.host}..."
            CompanionSettings.recordResult(context, "Pairing with ${request.host}...")
            EventSender.pair(context, request.server, request.token)
            return
        }
        CompanionSettings.save(
            context,
            request.server,
            request.token,
            CompanionSettings.testSender(context),
            false,
            true
        )
        pending.value = null
        notice.value = "Connected to ${request.host}"
        version.value += 1
        CompanionSettings.recordResult(context, "Connected to ${request.host}. Checking...")
        EventSender.checkConnection(context)
    }

    // The user typed the address and code: check them, then ask to confirm.
    fun confirmTyped(context: Context, server: String, code: String) {
        val cleanServer = server.trim().trimEnd('/')
        val cleanCode = SigningFormat.normalizeCode(code)
        when {
            !ConnectLink.isSafeServer(cleanServer) ->
                notice.value = "Not paired: the address must be a plain https:// address"
            cleanCode == null ->
                notice.value = "Not paired: enter the 8-character code from the website"
            else -> {
                notice.value = ""
                pending.value = ConnectRequest(cleanServer, cleanCode, isPairCode = true)
            }
        }
    }

    fun disconnect(context: Context) {
        DevicePairing.unpair(context)
        CompanionSettings.save(
            context,
            "",
            "",
            CompanionSettings.testSender(context),
            false,
            false
        )
        pending.value = null
        notice.value = "Disconnected. No SMS will be sent until you connect again."
        version.value += 1
        CompanionSettings.recordResult(context, "Disconnected")
    }
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LastSms.load(this)
        CompanionSettings.load(this)
        takeConnectLink(intent)
        setContent {
            PaytraceCompanionTheme {
                PaytraceScreen()
            }
        }
    }

    // The app is already open and a link or QR result arrives.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeConnectLink(intent)
    }

    override fun onResume() {
        super.onResume()
        LastSms.load(this)
        CompanionSettings.load(this)
        AppUsage.load(this)
        // Card M3: at most every 12 hours, and only if the person turned it on.
        AppUsage.sendIfDue(this)
    }

    // Reads a paytrace://connect link once, then forgets it, so turning
    // the phone does not ask again.
    private fun takeConnectLink(intent: Intent?) {
        val link = intent?.dataString ?: return
        intent.data = null
        ConnectInbox.receive(link)
    }
}

@Composable
fun PaytraceScreen() {

    val context = LocalContext.current

    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECEIVE_SMS
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        permissionGranted = granted
    }

    ConnectDialog()

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            Text(
                "Paytrace Companion",
                style = MaterialTheme.typography.headlineMedium
            )

            Text(
                "Sends your bank SMS to your Paytrace account. Only registered " +
                        "bank and service senders, like VM-HDFCBK-S, are read. OTP, " +
                        "PIN and password messages never leave the phone. Account " +
                        "numbers are masked to the last 4 digits.",
                style = MaterialTheme.typography.bodyMedium
            )

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("SMS permission", style = MaterialTheme.typography.titleMedium)
                    Text(if (permissionGranted) "Granted" else "Not granted")
                    if (!permissionGranted) {
                        Button(
                            onClick = {
                                permissionLauncher.launch(Manifest.permission.RECEIVE_SMS)
                            }
                        ) {
                            Text("Allow SMS access")
                        }
                        Text(
                            "If Allow is grey: Settings > Apps > Paytrace Companion > " +
                                    "menu > Allow restricted settings.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            ServerConnectionCard()

            AppUsageCard()

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Last bank SMS", style = MaterialTheme.typography.titleMedium)
                    val last = LastSms.latest.value
                    if (last == null) {
                        Text("No bank SMS received yet.")
                    } else {
                        Text("From: ${last.sender}")
                        Text("Received: ${last.receivedAt}")
                    }
                    Text(
                        "The message text is not kept on this screen.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            HorizontalDivider()

            Text(
                "HackFront 2026 | Version 0.7 - App usage",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

// Asks the user to confirm before the phone is connected to any server.
@Composable
fun ConnectDialog() {
    val context = LocalContext.current
    val request = ConnectInbox.pending.value ?: return

    AlertDialog(
        onDismissRequest = { ConnectInbox.pending.value = null },
        title = { Text(if (request.isPairCode) "Pair this phone?" else "Connect this phone?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Server: ${request.host}", fontWeight = FontWeight.Bold)
                if (request.isPairCode) {
                    Text("Code: ${request.shownCode}  (check it matches the website)")
                }
                Text(
                    "From now on, your bank SMS will be sent to this server. OTP and " +
                            "password messages stay on the phone, and account numbers are " +
                            "masked to the last 4 digits."
                )
                if (!request.isOfficial) {
                    Text(
                        "Warning: this is not the official Paytrace address " +
                                "(${ConnectLink.OFFICIAL_HOST}). Connect only if your own " +
                                "team gave you this link.",
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = { ConnectInbox.confirm(context, request) }) {
                Text(if (request.isPairCode) "Pair" else "Connect")
            }
        },
        dismissButton = {
            TextButton(onClick = { ConnectInbox.pending.value = null }) {
                Text("Cancel")
            }
        }
    )
}

// Opens Google's QR scanner. It needs no camera permission in this app,
// because Google Play services shows the camera and returns only the text.
fun scanConnectQr(context: Context) {
    val options = GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build()
    GmsBarcodeScanning.getClient(context, options)
        .startScan()
        .addOnSuccessListener { barcode -> ConnectInbox.receive(barcode.rawValue) }
        .addOnFailureListener {
            ConnectInbox.notice.value =
                "Could not open the QR scanner. Update Google Play services, or use the link on the website."
        }
}

@Composable
fun ServerConnectionCard() {

    val context = LocalContext.current
    val version = ConnectInbox.version.value

    var serverUrl by remember(version) { mutableStateOf(CompanionSettings.serverUrl(context)) }
    var token by remember(version) { mutableStateOf(CompanionSettings.pairingCode(context)) }
    var pairCode by remember(version) { mutableStateOf("") }
    val pairedWith = remember(version) { DevicePairing.pairedServer(context).orEmpty() }
    var sendingEnabled by remember(version) { mutableStateOf(CompanionSettings.sendingEnabled(context)) }
    var savedMessage by remember { mutableStateOf("") }

    fun saveAll() {
        CompanionSettings.save(
            context,
            serverUrl,
            token,
            CompanionSettings.testSender(context),
            false,
            sendingEnabled
        )
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {

            Text("Server connection", style = MaterialTheme.typography.titleMedium)

            Text(
                if (pairedWith.isNotEmpty())
                    "Paired with ${ConnectRequest(pairedWith, "").host}. Every SMS is signed by this phone's own key."
                else
                    "Not paired yet. On the Paytrace website, open Pair a phone, then scan the QR code here.",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold
            )

            Button(
                onClick = { scanConnectQr(context) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Scan QR code from the website")
            }

            if (ConnectInbox.notice.value.isNotEmpty()) {
                Text(ConnectInbox.notice.value, style = MaterialTheme.typography.bodySmall)
            }

            HorizontalDivider()

            Text(
                "Or type the server address and the 8-character code from the website:",
                style = MaterialTheme.typography.bodySmall
            )

            OutlinedTextField(
                value = serverUrl,
                onValueChange = {
                    serverUrl = it
                    savedMessage = ""
                },
                label = { Text("Server address") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = pairCode,
                onValueChange = { pairCode = it.uppercase().take(9) },
                label = { Text("Pairing code (like ABCD-EFGH)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    ConnectInbox.confirmTyped(context, serverUrl, pairCode)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Pair this phone")
            }

            OutlinedTextField(
                value = token,
                onValueChange = {
                    token = it
                    savedMessage = ""
                },
                label = { Text("Old personal token (only if not paired)") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Send bank SMS to server", modifier = Modifier.weight(1f))
                Switch(
                    checked = sendingEnabled,
                    onCheckedChange = {
                        sendingEnabled = it
                        savedMessage = ""
                    }
                )
            }

            Button(
                onClick = {
                    saveAll()
                    savedMessage =
                        if (!ConnectLink.isSafeServer(serverUrl.trim().trimEnd('/'))) {
                            "Saved. Note: the address must be a plain https:// address"
                        } else {
                            "Settings saved"
                        }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save Settings")
            }

            if (savedMessage.isNotEmpty()) {
                Text(savedMessage, style = MaterialTheme.typography.bodySmall)
            }

            HorizontalDivider()

            Text(
                "Sent: ${CompanionSettings.sentCount.value}    " +
                        "Blocked: ${CompanionSettings.blockedCount.value}",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                "Last result: ${CompanionSettings.lastResult.value}",
                style = MaterialTheme.typography.bodySmall
            )

            OutlinedButton(
                onClick = {
                    saveAll()
                    CompanionSettings.recordResult(context, "Checking connection...")
                    EventSender.checkConnection(context)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Check Connection")
            }

            OutlinedButton(
                onClick = { CompanionSettings.resetCounters(context) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Reset Counters")
            }

            OutlinedButton(
                onClick = { ConnectInbox.disconnect(context) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Unpair and disconnect this phone")
            }
        }
    }
}

// Card M3, optional: app usage for known subscription apps, so Paytrace can
// say "Spotify: paid every month, opened 0 minutes in 30 days".
@Composable
fun AppUsageCard() {
    val context = LocalContext.current
    // Re-read in onResume, so it updates when the person comes back from Settings.
    val access = AppUsage.access.value
    var enabled by remember { mutableStateOf(AppUsage.enabled(context)) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("App usage (optional)", style = MaterialTheme.typography.titleMedium)
            Text(
                "Finds subscriptions you pay for but don't use. Only for known " +
                        "subscription apps like Netflix or Spotify: the day each was last " +
                        "opened and its minutes in the last 30 days. Nothing on screen is " +
                        "read, and no other app is ever sent.",
                style = MaterialTheme.typography.bodySmall
            )
            Text(if (access) "Usage access: on" else "Usage access: off")
            if (!access) {
                Button(onClick = { context.startActivity(AppUsage.settingsIntent()) }) {
                    Text("Turn on usage access")
                }
                Text(
                    "In the list, tap Paytrace Companion and switch on Permit usage access.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Send app usage to Paytrace", modifier = Modifier.weight(1f))
                Switch(
                    checked = enabled,
                    enabled = access,
                    onCheckedChange = {
                        enabled = it
                        AppUsage.setEnabled(context, it)
                        if (it) AppUsage.sendIfDue(context, force = true)
                    }
                )
            }
            OutlinedButton(
                onClick = { AppUsage.sendIfDue(context, force = true) },
                enabled = access && enabled,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Send now")
            }
            if (AppUsage.lastResult.value.isNotEmpty()) {
                Text("Last result: ${AppUsage.lastResult.value}", style = MaterialTheme.typography.bodySmall)
            }
            AppUsage.found.value.take(8).forEach { app ->
                Text(
                    "${app.merchant}: " + (app.lastUsed?.let { "last opened $it" } ?: "not opened recently") +
                            ", ${app.minutes30d} min in 30 days",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}
