package com.paytrace.companion

// Card M2. The phone's own P-256 key in the Android Keystore, and its pairing.
// The private key never leaves the Keystore: the app can ask it to sign, but
// can never read the key itself. On phones that have StrongBox (a separate
// security chip), the key is made there.

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec

object DeviceKey {

    private const val ALIAS = "paytrace-device"

    private fun keyStore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    // Makes the key the first time, then returns the public key
    // (X.509 SubjectPublicKeyInfo, base64), which is what the server expects.
    fun publicKeyBase64(): String {
        if (!keyStore().containsAlias(ALIAS)) create()
        val publicKey = keyStore().getCertificate(ALIAS).publicKey
        return Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)
    }

    private fun create() {
        val wantStrongBox = Build.VERSION.SDK_INT >= 28
        try {
            generate(wantStrongBox)
        } catch (e: Exception) {
            // No StrongBox chip on this phone: use the normal secure Keystore.
            if (wantStrongBox) generate(false) else throw e
        }
    }

    private fun generate(strongBox: Boolean) {
        val builder = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
        if (strongBox && Build.VERSION.SDK_INT >= 28) builder.setIsStrongBoxBacked(true)
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").run {
            initialize(builder.build())
            generateKeyPair()
        }
    }

    // Signs the bytes with SHA256withECDSA. Android returns DER, which the server expects.
    fun sign(data: ByteArray): String {
        val key = keyStore().getKey(ALIAS, null) as PrivateKey
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(key)
            update(data)
            sign()
        }
        return Base64.encodeToString(signature, Base64.NO_WRAP)
    }

    fun delete() {
        val ks = keyStore()
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
    }

    // 18 random bytes as 24 URL-safe characters: a one-use number per request.
    fun newNonce(): String {
        val bytes = ByteArray(18).also { SecureRandom().nextBytes(it) }
        return Base64.encodeToString(bytes, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }
}

// Remembers which server this phone is paired with, and its device id.
// The device id alone is useless without the private key in the Keystore.
object DevicePairing {

    private const val PREFS = "paytrace_device"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // The device id, only if it belongs to the server address now saved.
    fun deviceIdFor(context: Context, server: String): String? {
        val p = prefs(context)
        val id = p.getString("deviceId", null) ?: return null
        return if (p.getString("server", "") == server) id else null
    }

    fun pairedServer(context: Context): String? =
        prefs(context).getString("server", null)

    fun save(context: Context, server: String, deviceId: String) {
        prefs(context).edit()
            .putString("server", server)
            .putString("deviceId", deviceId)
            .commit()
    }

    // Forgets the pairing and deletes the key, so this phone can sign nothing more.
    fun unpair(context: Context) {
        prefs(context).edit().clear().commit()
        DeviceKey.delete()
    }
}
