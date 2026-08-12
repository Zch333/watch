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
        platform.read(ReadRequest(subjectId, group.kinds, interval, cursor)).collect { result ->
            when (result) {
                is Result.Err -> {
                    rejected++
                    if (firstFailure == null) firstFailure = result.error
                    quarantine?.retain("huawei_hybrid", result.error, result.error.details.orEmpty(), clock.now())
                }
                is Result.Ok -> when (val normalized = HuaweiRecordNormalizer.normalize(result.value, consent, clock.now())) {
                    is Result.Ok -> {
                        accepted += normalized.value
                        result.value.nextCursor?.let { nextCursor = it }
                    }
                    is Result.Err -> {
                        rejected++
                        if (firstFailure == null) firstFailure = normalized.error
                        quarantine?.retain("huawei_hybrid", normalized.error, result.value.platformRecordId, clock.now())
                    }
                }
            }
        }
        if (accepted.isEmpty() && firstFailure != null) {
            val failure = firstFailure ?: DomainError("HEALTH_SYNC_UNKNOWN_FAILURE")
            audit.append(AuditEvent("HealthSyncFailed", clock.now(), subjectId.value,
                mapOf("group" to group.id, "error" to failure.code, "rejected" to rejected.toString())))
            return Result.Err(failure)
        }
        val stored = timeline.append(deduplicateTimeline(accepted))
        if (stored is Result.Ok && nextCursor != null) {
            cursors.write(SyncCursor("huawei_hybrid", group.id, subjectId, nextCursor!!, clock.now()))
        }
        audit.append(AuditEvent("HealthSyncCompleted", clock.now(), subjectId.value, mapOf("group" to group.id, "accepted" to accepted.size.toString(), "rejected" to rejected.toString())))
        return stored
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
        audit.append(AuditEvent("DataDeleted", clock.now(), subjectId.value, mapOf(
            "cloudConfigured" to (cloud != null).toString(),
            "cloudAcknowledged" to (cloudResult is Result.Ok).toString(),
            "failures" to failures.size.toString(),
        )))
        return failures.firstOrNull()?.let { Result.Err(it) } ?: Result.Ok(Unit)
    }
}
