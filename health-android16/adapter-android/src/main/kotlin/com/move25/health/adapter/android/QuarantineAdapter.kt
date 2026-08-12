package com.move25.health.adapter.android

import com.move25.health.domain.*
import com.move25.health.ports.QuarantinePort

class RoomQuarantine(
    private val dao: HealthDao,
    private val cipher: SensitivePayloadCipher,
    private val retentionMs: Long = 7L * 24 * 60 * 60 * 1_000,
) : QuarantinePort {
    override suspend fun retain(
        source: String,
        reason: DomainError,
        encryptedPayloadCandidate: String,
        at: InstantMs,
    ): Result<DomainError, Unit> = runCatching {
        val aad = "quarantine:$source:${reason.code}:${at.value}"
        dao.appendQuarantine(QuarantineEntity(source = source, reasonCode = reason.code,
            encryptedPayload = cipher.encrypt(encryptedPayloadCandidate.toByteArray(), aad.toByteArray()),
            receivedAtEpochMs = at.value, expiresAtEpochMs = at.value + retentionMs))
        Result.Ok(Unit)
    }.getOrElse { Result.Err(DomainError("QUARANTINE_APPEND_FAILED", it.message)) }

    override suspend fun purgeExpired(at: InstantMs): Result<DomainError, Int> = runCatching {
        Result.Ok(dao.purgeQuarantine(at.value))
    }.getOrElse { Result.Err(DomainError("QUARANTINE_PURGE_FAILED", it.message)) }
}
