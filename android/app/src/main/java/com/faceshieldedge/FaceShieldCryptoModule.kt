package com.faceshieldedge

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.facebook.react.bridge.*
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.KeyGenerator

/**
 * FaceShieldCryptoModule — Android Keystore-backed crypto operations
 *
 * Exposed to JS as NativeModules.FaceShieldCrypto
 *
 * Methods:
 *  generateKey()     → generates a 256-bit cryptographically secure random hex key
 *  sha256Sync(input) → synchronous SHA-256 hash (called in RecordFactory)
 */
class FaceShieldCryptoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FaceShieldCrypto"

    /**
     * Generate a 256-bit AES key stored in Android Keystore.
     * Returns hex representation for MMKV encryption key.
     */
    @ReactMethod
    fun generateKey(promise: Promise) {
        try {
            val keyAlias = "faceshield_mmkv_key"
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

            if (!keyStore.containsAlias(keyAlias)) {
                val keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    "AndroidKeyStore"
                )
                val spec = KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(false)
                    .build()
                keyGenerator.init(spec)
                keyGenerator.generateKey()
            }

            // Also generate a random bytes key for MMKV (separate from Keystore key)
            val randomBytes = ByteArray(32)
            SecureRandom().nextBytes(randomBytes)
            val hexKey = randomBytes.joinToString("") { "%02x".format(it) }
            promise.resolve(hexKey)
        } catch (e: Exception) {
            promise.reject("KEYGEN_ERROR", e.message, e)
        }
    }

    /**
     * Synchronous SHA-256 hash (called via bridge, not performance-critical).
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun sha256Sync(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }
}
