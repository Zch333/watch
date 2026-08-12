package com.move25.health.domain

import java.security.MessageDigest

enum class SensorMode { PASSIVE, BRIEF, WORKOUT, RESEARCH }

data class PowerBudget(
    val maxDurationSeconds: Int,
    val maxSampleRateHz: Double,
    val minimumBatteryPercent: Int,
    val screenOffAllowed: Boolean,
)

data class SensorSessionRequest(
    val sessionId: String,
    val sensor: String,
    val mode: SensorMode,
    val requestedDurationSeconds: Int,
    val requestedSampleRateHz: Double,
    val consentId: ConsentId,
    val budget: PowerBudget,
)

fun validateSession(request: SensorSessionRequest): Result<DomainError, SensorSessionRequest> {
    if (request.mode == SensorMode.PASSIVE) return Result.Err(DomainError("PASSIVE_MODE_CANNOT_OPEN_SENSOR"))
    if (request.requestedDurationSeconds !in 1..request.budget.maxDurationSeconds) return Result.Err(DomainError("SESSION_DURATION_EXCEEDS_BUDGET"))
    if (request.requestedSampleRateHz !in 0.1..request.budget.maxSampleRateHz) return Result.Err(DomainError("SAMPLE_RATE_EXCEEDS_BUDGET"))
    return Result.Ok(request)
}

enum class WatchMessageType { HELLO, CAPABILITIES, START_SESSION, STOP_SESSION, SAMPLE_BATCH, ACK, PHONE_SUMMARY, ERROR }

data class WatchEnvelope(
    val protocolVersion: Int = 1,
    val messageId: String,
    val sessionId: String?,
    val sequence: Long,
    val type: WatchMessageType,
    val sentAtEpochMs: Long,
    val payloadJson: String,
    val checksumSha256: String,
)

fun checksumFor(protocolVersion: Int, messageId: String, sessionId: String?, sequence: Long, type: WatchMessageType, sentAt: Long, payload: String): String {
    val canonical = "$protocolVersion|$messageId|${sessionId.orEmpty()}|$sequence|$type|$sentAt|$payload"
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray()).joinToString("") { "%02x".format(it) }
}

fun validateWatchEnvelope(envelope: WatchEnvelope, lastSequence: Long?): Result<DomainError, WatchEnvelope> {
    if (envelope.protocolVersion != 1) return Result.Err(DomainError("UNSUPPORTED_WATCH_PROTOCOL"))
    if (envelope.payloadJson.toByteArray().size > 960) return Result.Err(DomainError("WEAR_ENGINE_MESSAGE_TOO_LARGE"))
    val expected = checksumFor(envelope.protocolVersion, envelope.messageId, envelope.sessionId, envelope.sequence, envelope.type, envelope.sentAtEpochMs, envelope.payloadJson)
    if (expected != envelope.checksumSha256) return Result.Err(DomainError("WATCH_MESSAGE_CHECKSUM_INVALID"))
    if (lastSequence != null && envelope.sequence <= lastSequence && envelope.type != WatchMessageType.ACK) return Result.Err(DomainError("WATCH_MESSAGE_REPLAYED"))
    return Result.Ok(envelope)
}

fun createWatchEnvelope(
    messageId: String,
    sessionId: String?,
    sequence: Long,
    type: WatchMessageType,
    sentAtEpochMs: Long,
    payloadJson: String,
): Result<DomainError, WatchEnvelope> {
    if (messageId.isBlank() || sequence < 0 || sentAtEpochMs <= 0) return Result.Err(DomainError("WATCH_ENVELOPE_IDENTITY_INVALID"))
    if (payloadJson.toByteArray().size > 960) return Result.Err(DomainError("WEAR_ENGINE_MESSAGE_TOO_LARGE"))
    return Result.Ok(WatchEnvelope(1, messageId, sessionId, sequence, type, sentAtEpochMs, payloadJson,
        checksumFor(1, messageId, sessionId, sequence, type, sentAtEpochMs, payloadJson)))
}

data class BufferedSample(val sequence: Long, val payload: String, val checksum: String)

class ImmutableRingBuffer private constructor(private val capacity: Int, val items: List<BufferedSample>) {
    fun append(item: BufferedSample): ImmutableRingBuffer = ImmutableRingBuffer(capacity, (items + item).takeLast(capacity))
    fun acknowledge(sequence: Long): ImmutableRingBuffer = ImmutableRingBuffer(capacity, items.filter { it.sequence > sequence })
    companion object { fun empty(capacity: Int): ImmutableRingBuffer { require(capacity in 1..4096); return ImmutableRingBuffer(capacity, emptyList()) } }
}
