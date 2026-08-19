package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import org.json.JSONArray
import org.json.JSONObject

/** Canonical payloads shared with the API-20 Lite wearable companion. */
object LiteWearableContract {
    const val PROTOCOL_VERSION = 1
    const val MAX_WIRE_BYTES = 1_024
    const val MAX_PAYLOAD_BYTES = 960

    fun hello(appVersion: String, watchApiLevel: Int, capabilities: Set<String>): String = JSONObject()
        .put("appVersion", appVersion).put("watchApiLevel", watchApiLevel)
        .put("capabilities", JSONArray(capabilities.sorted())).toString()

    fun startSession(request: SensorSessionRequest): String = JSONObject()
        .put("sensor", request.sensor).put("mode", request.mode.name)
        .put("durationSeconds", request.requestedDurationSeconds).put("sampleRateHz", request.requestedSampleRateHz)
        .put("consentId", request.consentId.value).put("budget", JSONObject()
            .put("maxDurationSeconds", request.budget.maxDurationSeconds)
            .put("maxSampleRateHz", request.budget.maxSampleRateHz)
            .put("minimumBatteryPercent", request.budget.minimumBatteryPercent)
            .put("screenOffAllowed", request.budget.screenOffAllowed)).toString()

    fun sampleBatch(sensor: String, firstSequence: Long, samples: List<SensorSample>): Result<DomainError, String> {
        val payload = JSONObject().put("sensor", sensor).put("firstSequence", firstSequence)
            .put("samples", JSONArray(samples.map { sample -> JSONObject()
                .put("sequence", sample.sequence).put("epochMs", sample.epochMs)
                .put("values", JSONArray(sample.values)).put("confidence", sample.confidence) })).toString()
        return if (payload.toByteArray().size <= MAX_PAYLOAD_BYTES) Result.Ok(payload)
        else Result.Err(DomainError("WEAR_ENGINE_SAMPLE_BATCH_TOO_LARGE"))
    }

    fun acknowledgment(sequence: Long): String = JSONObject().put("sequence", sequence).toString()
    fun phoneSummary(title: String, facts: List<String>, limitations: List<String>): String = JSONObject()
        .put("title", title).put("facts", JSONArray(facts.take(4))).put("limitations", JSONArray(limitations.take(2))).toString()
}
