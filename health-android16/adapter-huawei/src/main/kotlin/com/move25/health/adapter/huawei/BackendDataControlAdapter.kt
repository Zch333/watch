package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.CloudDeletionPort
import okhttp3.OkHttpClient
import okhttp3.Request

class BackendDataControlAdapter(
    private val config: BackendConfig,
    private val http: OkHttpClient,
    private val tokens: BackendAccessTokenProvider,
) : CloudDeletionPort {
    override suspend fun deleteSubject(subjectId: SubjectId): Result<DomainError, Unit> = runCatching {
        val url = config.baseUrl.resolve("v1/health/subjects/${java.net.URLEncoder.encode(subjectId.value, Charsets.UTF_8.name())}")!!
        http.executeAwait(Request.Builder().url(url).bearer(tokens.validAccessToken()).delete().build()).use {
            when (it.code) {
                200, 202, 204, 404 -> Result.Ok(Unit)
                else -> Result.Err(DomainError("CLOUD_DELETE_HTTP_${it.code}"))
            }
        }
    }.getOrElse { Result.Err(DomainError("CLOUD_DELETE_FAILED", it.message)) }
}
