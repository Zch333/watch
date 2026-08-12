package com.move25.health.adapter.huawei

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import java.io.IOException
import kotlin.coroutines.resume

data class BackendConfig(
    val baseUrl: HttpUrl,
    val certificatePins: Set<String>,
) {
    init {
        require(baseUrl.isHttps) { "Health backend must use HTTPS" }
        require(certificatePins.all { it.startsWith("sha256/") }) { "Certificate pins must be SHA-256 pins" }
    }
}

fun pinnedHttpClient(config: BackendConfig): OkHttpClient {
    val builder = OkHttpClient.Builder().callTimeout(java.time.Duration.ofSeconds(30))
    if (config.certificatePins.isNotEmpty()) {
        builder.certificatePinner(CertificatePinner.Builder().apply {
            config.certificatePins.forEach { add(config.baseUrl.host, it) }
        }.build())
    }
    return builder.build()
}

interface BackendAccessTokenProvider { suspend fun validAccessToken(): String }

internal suspend fun OkHttpClient.executeAwait(request: Request): Response = suspendCancellableCoroutine { continuation ->
    val call = newCall(request)
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (continuation.isActive) continuation.resumeWith(Result.failure(e)) }
        override fun onResponse(call: Call, response: Response) { continuation.resume(response) }
    })
}

internal fun Request.Builder.bearer(token: String): Request.Builder = header("Authorization", "Bearer $token")
