package com.paytrace.companion

// The one screen of the Paytrace Companion app (card M1).
// It shows the SMS permission, the server connection and the counters.
// The phone does not read payment fields: it sends the bank SMS text,
// with account numbers masked, and the server's AI reads it.

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.paytrace.companion.ui.theme.PaytraceCompanionTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LastSms.load(this)
        CompanionSettings.load(this)
        setContent {
            PaytraceCompanionTheme {
                PaytraceScreen()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        LastSms.load(this)
        CompanionSettings.load(this)
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
                "HackFront 2026 | Version 0.4 - Real bank SMS",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
fun ServerConnectionCard() {

    val context = LocalContext.current

    var serverUrl by remember { mutableStateOf(CompanionSettings.serverUrl(context)) }
    var pairingCode by remember { mutableStateOf(CompanionSettings.pairingCode(context)) }
    var sendingEnabled by remember { mutableStateOf(CompanionSettings.sendingEnabled(context)) }
    var savedMessage by remember { mutableStateOf("") }

    fun saveAll() {
        CompanionSettings.save(
            context,
            serverUrl,
            pairingCode,
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
                "Paste the server's https:// address. On the emulator, use " +
                        "http://10.0.2.2:3000",
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
                value = pairingCode,
                onValueChange = {
                    pairingCode = it
                    savedMessage = ""
                },
                label = { Text("Pairing code") },
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
                        if (!EventSender.isAllowedAddress(serverUrl.trim())) {
                            "Saved. Note: the address must start with https://"
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
        }
    }
}
