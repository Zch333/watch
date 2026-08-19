package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** Model-neutral cloud agent gateway. Provider credentials and Koog/DeepSeek live server-side. */
class BackendAgentAdapter(
    private val config: BackendConfig,
    private val http: OkHttpClient,
    private val tokens: BackendAccessTokenProvider,
) : CloudAgentPort {
    override suspend fun capability(): Capability = Capability.Available(mapOf("transport" to "Move25 backend", "provider" to "server-selected"))

    override fun stream(request: AgentRequest): Flow<Result<DomainError, AgentChunk>> = flow {
        val report = request.verifiedReport
        val body = JSONObject().put("schemaVersion", 1).put("sessionId", request.sessionId)
            .put("subjectPseudonym", request.subjectId.value).put("locale", request.locale).put("prompt", request.prompt)
            .put("verifiedReport", JSONObject().put("title", report.title).put("confidence", report.confidence.name)
                .put("observations", JSONArray(report.observations)).put("actions", JSONArray(report.actions))
                .put("redFlags", JSONArray(report.redFlags)).put("limitations", JSONArray(report.limitations))).toString()
        try {
            http.executeAwait(Request.Builder().url(config.baseUrl.resolve("v1/health/agent/stream")!!)
                .bearer(tokens.validAccessToken()).post(body.toRequestBody(JSON)).build()).use { response ->
                if (!response.isSuccessful) {
                    emit(Result.Err(DomainError("CLOUD_AGENT_HTTP_${response.code}")))
                    return@flow
                }
                response.body.source().use { source ->
                    while (!source.exhausted()) {
                        val line = source.readUtf8Line() ?: break
                        if (!line.startsWith("data:")) continue
                        val event = JSONObject(line.removePrefix("data:").trim())
                        emit(Result.Ok(AgentChunk(event.getString("text"), event.optBoolean("partial", true), event.optString("model", "server-selected"))))
                    }
                }
            }
        } catch (failure: Throwable) {
            emit(Result.Err(DomainError("CLOUD_AGENT_FAILED", failure.message)))
        }
    }

    private companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
