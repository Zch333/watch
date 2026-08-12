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
) {
    suspend operator fun invoke(subjectId: SubjectId, group: HuaweiDataGroup, interval: TimeInterval): Result<DomainError, AppendResult> {
        val consent = consents.activeConsent(subjectId, "health:${group.id}") ?: return Result.Err(DomainError("CONSENT_REQUIRED", group.id))
        val cursor = cursors.read("huawei_hybrid", group.id, subjectId)
        val accepted = mutableListOf<Observation>()
        var rejected = 0
        platform.read(ReadRequest(subjectId, group.kinds, interval, cursor)).collect { result ->
            when (result) {
                is Result.Err -> rejected++
                is Result.Ok -> when (val normalized = HuaweiRecordNormalizer.normalize(result.value, consent, clock.now())) {
                    is Result.Ok -> accepted += normalized.value
                    is Result.Err -> rejected++
                }
            }
        }
        val stored = timeline.append(deduplicateTimeline(accepted))
        audit.append(AuditEvent("HealthSyncCompleted", clock.now(), subjectId.value, mapOf("group" to group.id, "accepted" to accepted.size.toString(), "rejected" to rejected.toString())))
        return stored
    }
}

class DeleteSubjectDataUseCase(
    private val platform: PlatformHealthPort,
    private val timeline: TimelineStorePort,
    private val cloud: CloudDeletionPort,
    private val consentStore: ConsentStorePort,
    private val audit: AuditPort,
    private val clock: ClockPort,
) {
    suspend operator fun invoke(subjectId: SubjectId): Result<DomainError, Unit> {
        huaweiDataPlan.forEach { consentStore.revoke(subjectId, "health:${it.id}", clock.now()) }
        platform.revoke(huaweiDataPlan.mapNotNull { it.scope?.let { scope -> DataScope(it.id, scope) } }.toSet())
        timeline.tombstone(subjectId)
        timeline.deleteDerived(subjectId)
        val cloudResult = cloud.deleteSubject(subjectId)
        audit.append(AuditEvent("DataDeleted", clock.now(), subjectId.value, mapOf("cloud" to (cloudResult is Result.Ok).toString())))
        return cloudResult
    }
}
