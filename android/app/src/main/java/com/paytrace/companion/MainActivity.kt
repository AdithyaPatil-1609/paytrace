
package com.paytrace.companion

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
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
import java.time.LocalDate

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        PaymentInbox.load(this)
        CompanionSettings.load(this)

        setContent {
            PaytraceCompanionTheme {
                PaytraceScreen()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        PaymentInbox.load(this)
        CompanionSettings.load(this)
    }
}

@Composable
fun PaytraceScreen() {

    val context = LocalContext.current

    var smsText by remember {
        mutableStateOf(
            "Rs. 499 debited from A/c XX1234 for NETFLIX " +
                    "on 21-11-2026. Ref: TXN98765."
        )
    }

    var manualPayment by remember {
        mutableStateOf<PaymentDetails?>(null)
    }

    var attempted by remember {
        mutableStateOf(false)
    }

    val automaticPayment = PaymentInbox.latest.value

    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECEIVE_SMS
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
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

            verticalArrangement =
                Arrangement.spacedBy(16.dp)
        ) {

            Text(
                "Paytrace Companion",
                style = MaterialTheme.typography.headlineMedium
            )

            Text(
                "Automatic SMS Detection",
                style = MaterialTheme.typography.titleLarge
            )

            Text(
                "Synthetic test mode. While \"Test sender only\" " +
                        "is on, only messages from the test sender " +
                        "are read. Password and OTP messages never " +
                        "leave the phone."
            )

            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement =
                        Arrangement.spacedBy(8.dp)
                ) {

                    Text(
                        "TEST MODE ENABLED",
                        style = MaterialTheme.typography.titleMedium
                    )

                    Text(
                        if (permissionGranted)
                            "SMS permission: Granted"
                        else
                            "SMS permission: Not granted"
                    )

                    Text(
                        "Sender rules: see Laptop Connection below"
                    )

                    if (!permissionGranted) {
                        Button(
                            onClick = {
                                permissionLauncher.launch(
                                    Manifest.permission.RECEIVE_SMS
                                )
                            }
                        ) {
                            Text("Enable Test SMS Reception")
                        }
                    }
                }
            }

            LaptopConnectionCard()

            Text(
                "Automatically Detected Payment",
                style = MaterialTheme.typography.titleMedium
            )

            if (automaticPayment == null) {

                Text(
                    "No synthetic SMS received yet. " +
                            "Send a test message using the " +
                            "Android emulator's Phone controls."
                )

            } else {

                PaymentCard(
                    payment = automaticPayment,
                    status = "Automatically Detected"
                )


                OutlinedButton(
                    onClick = {
                        PaymentInbox.clear(context)
                        DuplicateDetector.clear(context)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Reset Test Payments")
                }

            }

            HorizontalDivider()

            Text(
                "Manual Payment Detection",
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedTextField(
                value = smsText,

                onValueChange = {
                    smsText = it
                    manualPayment = null
                    attempted = false
                },

                label = {
                    Text("Fictional Payment SMS")
                },

                modifier = Modifier.fillMaxWidth(),
                minLines = 4
            )

            Button(
                onClick = {
                    attempted = true
                    manualPayment = SmsParser.parse(smsText)
                },

                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Detect Payment")
            }

            if (attempted && manualPayment == null) {

                Text(
                    "Message rejected. Invalid or " +
                            "unsupported fictional SMS.",
                    color = MaterialTheme.colorScheme.error
                )
            }

            manualPayment?.let { result ->

                PaymentCard(
                    payment = result,
                    status = "Parsed Manually"
                )
            }

            HorizontalDivider()

            Text(
                "HackFront 2026 | Member 4",
                style = MaterialTheme.typography.bodySmall
            )

            Text(
                "Version 0.3 - Sends to laptop",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
fun PaymentCard(
    payment: PaymentDetails,
    status: String
) {

    Card(
        modifier = Modifier.fillMaxWidth()
    ) {

        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement =
                Arrangement.spacedBy(8.dp)
        ) {

            Text(
                "Payment Detected",
                style = MaterialTheme.typography.titleLarge
            )

            HorizontalDivider()

            val eventLabel = when (payment.kind) {
                "debit_posted" -> "Payment Debited"
                "mandate_created" -> "Autopay Mandate Created"
                "mandate_cancelled" -> "Autopay Mandate Cancelled"
                "debit_scheduled" -> "Upcoming Debit"
                "debit_failed" -> "Payment Failed"
                else -> "Unknown Event"
            }

            Text(
                text = "Event: $eventLabel",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.titleMedium
            )
            Text("Merchant: ${payment.merchant}")

            val rupees = payment.amountPaise / 100
            val paise = (payment.amountPaise % 100)
                .toString()
                .padStart(2, '0')


            if (payment.kind == "mandate_cancelled") {
                Text("Amount: Not applicable")
            } else {
                val amountLabel = when (payment.kind) {
                    "mandate_created" -> "Mandate Limit"
                    "debit_scheduled" -> "Scheduled Amount"
                    "debit_failed" -> "Attempted Amount"
                    else -> "Amount"
                }

                Text("$amountLabel: Rs. $rupees.$paise")
            }


            Text("Date: ${payment.date}")

            Text("Reference: ${payment.reference}")

            HorizontalDivider()

            Text(
                "Status: $status",
                color = MaterialTheme.colorScheme.primary
            )

            Text(
                "Synthetic payment. Only the fields above " +
                        "are kept; the SMS text is never stored or sent.",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
fun LaptopConnectionCard() {

    val context = LocalContext.current

    var serverUrl by remember {
        mutableStateOf(CompanionSettings.serverUrl(context))
    }
    var pairingCode by remember {
        mutableStateOf(CompanionSettings.pairingCode(context))
    }
    var testSender by remember {
        mutableStateOf(CompanionSettings.testSender(context))
    }
    var testSenderOnly by remember {
        mutableStateOf(CompanionSettings.testSenderOnly(context))
    }
    var sendingEnabled by remember {
        mutableStateOf(CompanionSettings.sendingEnabled(context))
    }
    var savedMessage by remember {
        mutableStateOf("")
    }

    fun saveAll() {
        CompanionSettings.save(
            context,
            serverUrl,
            pairingCode,
            testSender,
            testSenderOnly,
            sendingEnabled
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {

            Text(
                "Laptop Connection",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                "Emulator: http://10.0.2.2:3000\n" +
                        "Real phone: the https://...trycloudflare.com address",
                style = MaterialTheme.typography.bodySmall
            )

            OutlinedTextField(
                value = serverUrl,
                onValueChange = {
                    serverUrl = it
                    savedMessage = ""
                },
                label = { Text("Laptop address") },
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

            OutlinedTextField(
                value = testSender,
                onValueChange = {
                    testSender = it
                    savedMessage = ""
                },
                label = { Text("Test sender number") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Test sender only",
                    modifier = Modifier.weight(1f)
                )
                Switch(
                    checked = testSenderOnly,
                    onCheckedChange = {
                        testSenderOnly = it
                        savedMessage = ""
                    }
                )
            }

            if (!testSenderOnly) {
                Text(
                    "Real alerts can pass now. Switch this off only " +
                            "after a clear yes at Mentor Round 1.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Send events to laptop",
                    modifier = Modifier.weight(1f)
                )
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
                            "Saved. Note: the address must start with " +
                                    "https:// or http://10.0.2.2"
                        } else {
                            "Settings saved"
                        }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save Settings")
            }

            if (savedMessage.isNotEmpty()) {
                Text(
                    savedMessage,
                    style = MaterialTheme.typography.bodySmall
                )
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
                    CompanionSettings.recordResult(
                        context,
                        "Sending test event..."
                    )
                    EventSender.sendAndRecord(
                        context,
                        PaymentDetails(
                            merchant = "DEMOFLIX",
                            amountPaise = 19900,
                            date = LocalDate.now().toString(),
                            reference = "TEST0001",
                            kind = "debit_posted"
                        )
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Send Test Event")
            }

            OutlinedButton(
                onClick = {
                    CompanionSettings.resetCounters(context)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Reset Counters")
            }
        }
    }
}
