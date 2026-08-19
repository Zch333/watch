package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.collect

class SyncHealthDataUseCase(
    private val platform: PlatformHealthPort,
    private val timeline: TimelineStorePort,
    private val consents: ConsentStorePort,
    private val cursors: SyncCursorPort,
    private val clock: ClockPort,
    private val audit: AuditPort,
    private val quarantine: QuarantinePort? = null,
) {
    suspend operator fun invoke(subjectId: SubjectId, group: HuaweiDataGroup, interval: TimeInterval): Result<DomainError, AppendResult> {
        val consent = consents.activeConsent(subjectId, "health:${group.id}") ?: return Result.Err(DomainError("CONSENT_REQUIRED", group.id))
        val cursor = cursors.read("huawei_hybrid", group.id, subjectId)
        val accepted = mutableListOf<Observation>()
        var rejected = 0
        var firstFailure: DomainError? = null
        var nextCursor: String? = null
        var quarantineFailure: DomainError? = null
        platform.read(ReadRequest(subjectId, group.kinds, interval, cursor)).collect { result ->
            when (result) {
                is Result.Err -> {
                    rejected++
                    if (firstFailure == null) firstFailure = result.error
                    when (val retained = quarantine?.retain(
                        "huawei_hybrid", result.error, "read-error:${result.error.code}", clock.now(),
                    )) {
                        is Result.Err -> if (quarantineFailure == null) quarantineFailure = retained.error
                        else -> Unit
                    }
                }
                is Result.Ok -> when (val normalized = HuaweiRecordNormalizer.normalize(result.value, consent, clock.now())) {
                    is Result.Ok -> {
                        accepted += normalized.value
                        result.value.nextCursor?.let { nextCursor = it }
                    }
                    is Result.Err -> {
                        rejected++
                        if (firstFailure == null) firstFailure = normalized.error
                        when (val retained = quarantine?.retain(
                            "huawei_hybrid", normalized.error, result.value.platformRecordId, clock.now(),
                        )) {
                            is Result.Err -> if (quarantineFailure == null) quarantineFailure = retained.error
                            else -> Unit
                        }
                    }
                }
            }
        }
        quarantineFailure?.let { return failed(subjectId, group, rejected, it) }
        if (accepted.isEmpty() && firstFailure != null) {
            val failure = firstFailure ?: DomainError("HEALTH_SYNC_UNKNOWN_FAILURE")
            return failed(subjectId, group, rejected, failure)
        }
        val stored = when (val result = timeline.append(deduplicateTimeline(accepted))) {
            is Result.Ok -> result
            is Result.Err -> return failed(subjectId, group, rejected, result.error)
        }
        nextCursor?.let { opaqueValue ->
            when (val written = cursors.write(SyncCursor("huawei_hybrid", group.id, subjectId, opaqueValue, clock.now()))) {
                is Result.Err -> return failed(subjectId, group, rejected, written.error)
                is Result.Ok -> Unit
            }
        }
        when (val recorded = audit.append(AuditEvent(
            "HealthSyncCompleted",
            clock.now(),
            subjectId.value,
            mapOf(
                "group" to group.id,
                "accepted" to accepted.size.toString(),
                "rejected" to rejected.toString(),
            ),
        ))) {
            is Result.Err -> return recorded
            is Result.Ok -> Unit
        }
        return stored
    }

    private suspend fun failed(
        subjectId: SubjectId,
        group: HuaweiDataGroup,
        rejected: Int,
        failure: DomainError,
    ): Result<DomainError, AppendResult> = when (val recorded = audit.append(AuditEvent(
        "HealthSyncFailed",
        clock.now(),
        subjectId.value,
        mapOf("group" to group.id, "error" to failure.code, "rejected" to rejected.toString()),
    ))) {
        is Result.Ok -> Result.Err(failure)
        is Result.Err -> Result.Err(DomainError("HEALTH_SYNC_AND_AUDIT_FAILED", "${failure.code},${recorded.error.code}"))
    }
}

class DeleteSubjectDataUseCase(
    private val platform: PlatformHealthPort,
    private val timeline: TimelineStorePort,
    private val cloud: CloudDeletionPort?,
    private val consentStore: ConsentStorePort,
    private val audit: AuditPort,
    private val clock: ClockPort,
) {
    suspend operator fun invoke(subjectId: SubjectId): Result<DomainError, Unit> {
        val failures = mutableListOf<DomainError>()
        (huaweiDataPlan.map { "health:${it.id}" } + listOf("manual_health_entry", "ai_explanation", "app_function_summary"))
            .forEach { purpose -> when (val revoked = consentStore.revoke(subjectId, purpose, clock.now())) {
                is Result.Err -> failures += revoked.error
                is Result.Ok -> Unit
            } }
        when (val revoked = platform.revoke(huaweiDataPlan.map { DataScope(it.id, it.scope) }.toSet())) {
            is Result.Err -> failures += revoked.error
            is Result.Ok -> Unit
        }
        when (val tombstoned = timeline.tombstone(subjectId)) {
            is Result.Err -> failures += tombstoned.error
            is Result.Ok -> Unit
        }
        when (val deleted = timeline.deleteDerived(subjectId)) {
            is Result.Err -> failures += deleted.error
            is Result.Ok -> Unit
        }
        val cloudResult = cloud?.deleteSubject(subjectId) ?: Result.Ok(Unit)
        if (cloudResult is Result.Err) failures += cloudResult.error
        when (val recorded = audit.append(AuditEvent("DataDeleted", clock.now(), subjectId.value, mapOf(
            "cloudConfigured" to (cloud != null).toString(),
            "cloudAcknowledged" to (cloudResult is Result.Ok).toString(),
            "failures" to failures.size.toString(),
        )))) {
            is Result.Err -> failures += recorded.error
            is Result.Ok -> Unit
        }
        return failures.firstOrNull()?.let { Result.Err(it) } ?: Result.Ok(Unit)
    }
}
