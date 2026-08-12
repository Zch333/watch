package com.move25.health.adapter.android

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SensitivePayloadCipher {
    fun encrypt(plainText: ByteArray, associatedData: ByteArray = byteArrayOf()): ByteArray
    fun decrypt(cipherText: ByteArray, associatedData: ByteArray = byteArrayOf()): ByteArray
}

/** AES-256-GCM key is non-exportable and held by Android Keystore. */
class AndroidKeystoreCipher(private val alias: String = "move25.health.payload.v1") : SensitivePayloadCipher {
    private val key: SecretKey by lazy { loadOrCreateKey() }

    override fun encrypt(plainText: ByteArray, associatedData: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        if (associatedData.isNotEmpty()) cipher.updateAAD(associatedData)
        val encrypted = cipher.doFinal(plainText)
        return ByteBuffer.allocate(1 + cipher.iv.size + encrypted.size)
            .put(cipher.iv.size.toByte()).put(cipher.iv).put(encrypted).array()
    }

    override fun decrypt(cipherText: ByteArray, associatedData: ByteArray): ByteArray {
        require(cipherText.isNotEmpty()) { "Encrypted payload is empty" }
        val buffer = ByteBuffer.wrap(cipherText)
        val ivSize = buffer.get().toInt() and 0xff
        require(ivSize in 12..16 && cipherText.size > 1 + ivSize) { "Encrypted payload header is invalid" }
        val iv = ByteArray(ivSize).also(buffer::get)
        val encrypted = ByteArray(buffer.remaining()).also(buffer::get)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        if (associatedData.isNotEmpty()) cipher.updateAAD(associatedData)
        return cipher.doFinal(encrypted)
    }

    private fun loadOrCreateKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
            generateKey()
        }
    }
}

/** Tests only. Production composition roots must use [AndroidKeystoreCipher]. */
class IdentityTestCipher : SensitivePayloadCipher {
    override fun encrypt(plainText: ByteArray, associatedData: ByteArray): ByteArray = plainText.copyOf()
    override fun decrypt(cipherText: ByteArray, associatedData: ByteArray): ByteArray = cipherText.copyOf()
}
