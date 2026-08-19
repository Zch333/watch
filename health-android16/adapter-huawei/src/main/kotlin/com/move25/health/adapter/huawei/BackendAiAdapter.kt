package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.AiInferencePort
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/** Only the backend can call DeepSeek or another model; the APK never contains a model key. */
class BackendAiAdapter(
    private val config: BackendConfig,
    private val http: OkHttpClient,
    private val tokens: BackendAccessTokenProvider,
) : AiInferencePort {
    override suspend fun complete(envelope: AiEnvelope): Result<DomainError, UntrustedAiOutput> = runCatching {
        val response = http.executeAwait(Request.Builder().url(config.baseUrl.resolve("v1/health/ai/explain")!!)
            .bearer(tokens.validAccessToken()).post(encode(envelope).toRequestBody(JSON)).build())
        response.use {
            if (!it.isSuccessful) return Result.Err(DomainError("AI_BACKEND_HTTP_${it.code}"))
            val output = decode(JSONObject(it.body.string()))
            validateAiOutput(output, envelope)
        }
    }.getOrElse { Result.Err(DomainError("AI_BACKEND_FAILED", it.message)) }

    private fun encode(value: AiEnvelope): String = JSONObject().put("schemaVersion", value.schemaVersion)
        .put("purpose", value.purpose).put("locale", value.locale).put("insightId", value.insightId)
        .put("facts", JSONArray(value.facts.map { JSONObject().put("id", it.id).put("metricId", it.metricId).put("value", it.value).put("unit", it.unit).put("quality", it.quality) }))
        .put("trends", JSONArray(value.trends.map { JSONObject().put("metricId", it.metricId.value).put("direction", it.direction).put("statement", it.statement) }))
        .put("deviations", JSONArray(value.deviations.map { JSONObject().put("metricId", it.metricId.value).put("observed", it.observed).put("baseline", it.baseline).put("direction", it.direction) }))
        .put("inputConfidence", value.inputConfidence.name).put("limitations", JSONArray(value.limitations))
        .put("redFlags", JSONArray(value.redFlags.map { JSONObject().put("id", it.id).put("message", it.message) }))
        .put("allowedActions", JSONArray(value.allowedActions.map { JSONObject().put("id", it.id).put("text", it.text).put("evaluationWindow", it.evaluationWindow) }))
        .put("goals", JSONArray(value.goals)).toString()

    private fun decode(json: JSONObject): UntrustedAiOutput = UntrustedAiOutput(
        json.getString("summaryTitle"), Confidence.valueOf(json.getString("overallConfidence")),
        json.objects("observations") { AiObservation(it.getString("statement"), it.strings("factIds"), Confidence.valueOf(it.getString("confidence"))) },
        json.objects("trends") { AiTrend(it.getString("statement"), it.strings("metricIds"), it.getString("direction")) },
        json.strings("possibleNonmedicalExplanations"),
        json.objects("actions") { AiAction(it.getString("action"), it.getString("rationale"), it.getString("evaluationWindow")) },
        json.objects("redFlags") { AiRedFlag(it.getString("message"), it.getString("sourceRuleId")) },
        json.strings("limitations"), json.strings("clinicianDiscussionPoints"), json.strings("needsClarification"),
    )

    private fun JSONObject.strings(key: String): List<String> = optJSONArray(key)?.let { array -> (0 until array.length()).map(array::getString) } ?: emptyList()
    private fun <T> JSONObject.objects(key: String, transform: (JSONObject) -> T): List<T> =
        (optJSONArray(key) ?: JSONArray()).let { array -> (0 until array.length()).map { transform(array.getJSONObject(it)) } }

    private companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
