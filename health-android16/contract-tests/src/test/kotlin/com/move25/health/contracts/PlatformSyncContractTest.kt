package com.move25.health.contracts

import com.move25.health.application.SyncHealthDataUseCase
import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class PlatformSyncContractTest {
    @Test fun `repeated platform reads stay idempotent and cursor advances only after storage`() = runTest {
        val subject = SubjectId("subject")
        val platform = RecordingPlatform(record(subject))
        val timeline = MemoryTimeline()
        val consents = MemoryConsents()
        consents.grant(subject, "health:activity", setOf(DataScope("activity", null)), InstantMs(1))
        val cursors = MemoryCursors()
        val audit = RecordingAudit()
        val useCase = SyncHealthDataUseCase(platform, timeline, consents, cursors, FixedClock(), audit)
        val interval = TimeInterval.of(0, 100).getOrNull()!!

        val first = useCase(subject, huaweiDataPlan.first { it.id == "activity" }, interval).getOrNull()!!
        val second = useCase(subject, huaweiDataPlan.first { it.id == "activity" }, interval).getOrNull()!!

        assertEquals(1, first.inserted)
        assertEquals(0, second.inserted)
        assertEquals(1, second.duplicates)
        assertEquals("cursor-1", cursors.read("huawei_hybrid", "activity", subject)?.opaqueValue)
        assertEquals(2, audit.items.size)
    }

    private fun record(subject: SubjectId) = RawPlatformRecord("platform-1", subject, "STEP_COUNT", "1234", "COUNT", 10, 20,
        "HUAWEI WATCH GT 6", "device", "firmware", "Health Service Kit", "approved", 30, "cursor-1")
}

private class RecordingPlatform(private val item: RawPlatformRecord) : PlatformHealthPort {
    override suspend fun capabilities() = mapOf("activity" to Capability.Available())
    override suspend fun requestAuthorization(scopes: Set<DataScope>) = Result.Ok(AuthorizationResult(scopes, emptySet()))
    override fun read(request: ReadRequest): Flow<Result<DomainError, RawPlatformRecord>> = flowOf(Result.Ok(item))
    override fun changes(cursor: SyncCursor?): Flow<Result<DomainError, PlatformChange>> = flowOf()
    override suspend fun revoke(scopes: Set<DataScope>) = Result.Ok(Unit)
}

private class MemoryTimeline : TimelineStorePort {
    private var values = emptyList<Observation>()
    override suspend fun append(batch: List<Observation>): Result<DomainError, AppendResult> {
        val existing = values.map { "${it.provenance.sourcePlatform}:${it.provenance.platformRecordId}" }.toSet()
        val accepted = batch.filter { "${it.provenance.sourcePlatform}:${it.provenance.platformRecordId}" !in existing }
        values = deduplicateTimeline(values + accepted)
        return Result.Ok(AppendResult(accepted.size, batch.size - accepted.size))
    }
    override suspend fun query(query: TimelineQuery) = Result.Ok(window(values, query.interval ?: TimeInterval.of(0, Long.MAX_VALUE).getOrNull()!!))
    override fun observe(query: TimelineQuery): Flow<List<Observation>> = MutableStateFlow(values)
    override suspend fun tombstone(subjectId: SubjectId, kinds: Set<ObservationKind>) = Result.Ok(values.size.also { values = emptyList() })
    override suspend fun deleteDerived(subjectId: SubjectId) = Result.Ok(Unit)
}

private class MemoryConsents : ConsentStorePort {
    private val values = mutableMapOf<String, ConsentId>()
    override suspend fun grant(subjectId: SubjectId, purpose: String, scopes: Set<DataScope>, at: InstantMs): Result<DomainError, ConsentId> =
        Result.Ok(ConsentId("consent:$purpose").also { values["${subjectId.value}:$purpose"] = it })
    override suspend fun revoke(subjectId: SubjectId, purpose: String, at: InstantMs) = Result.Ok(Unit).also { values.remove("${subjectId.value}:$purpose") }
    override suspend fun activeConsent(subjectId: SubjectId, purpose: String) = values["${subjectId.value}:$purpose"]
}

private class MemoryCursors : SyncCursorPort {
    private var value: SyncCursor? = null
    override suspend fun read(source: String, dataType: String, subjectId: SubjectId) = value
    override suspend fun write(cursor: SyncCursor) = Result.Ok(Unit).also { value = cursor }
}

private class RecordingAudit : AuditPort {
    val items = mutableListOf<AuditEvent>()
    override suspend fun append(event: AuditEvent) = Result.Ok(Unit).also { items += event }
}

private class FixedClock : ClockPort { override fun now() = InstantMs(100) }
