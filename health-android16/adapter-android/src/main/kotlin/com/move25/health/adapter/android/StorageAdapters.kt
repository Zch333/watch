package com.move25.health.adapter.android

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.UUID

private fun SensitivePayloadCipher.encryptText(value: String, aad: String) =
    encrypt(value.toByteArray(StandardCharsets.UTF_8), aad.toByteArray(StandardCharsets.UTF_8))
private fun SensitivePayloadCipher.decryptText(value: ByteArray, aad: String) =
    String(decrypt(value, aad.toByteArray(StandardCharsets.UTF_8)), StandardCharsets.UTF_8)

private fun <A> kotlin.Result<Result<DomainError, A>>.sanitized(errorCode: String): Result<DomainError, A> = fold(
    onSuccess = { it },
    onFailure = { failure ->
        if (failure is CancellationException) throw failure
        Result.Err(DomainError(errorCode))
    },
)

class RoomTimelineStore(
    private val dao: HealthDao,
    private val cipher: SensitivePayloadCipher,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) : TimelineStorePort {
    override suspend fun append(batch: List<Observation>): Result<DomainError, AppendResult> = runCatching {
        val valid = batch.map { item ->
            when (val checked = validateObservation(item)) {
                is Result.Ok -> checked.value
                is Result.Err -> throw IllegalArgumentException(checked.error.code)
            }
        }
        val inserted = dao.insertObservations(valid.map(::toEntity)).count { it != -1L }
        Result.Ok(AppendResult(inserted, valid.size - inserted))
    }.sanitized("LOCAL_APPEND_FAILED")

    override suspend fun query(query: TimelineQuery): Result<DomainError, List<Observation>> = runCatching {
        Result.Ok(filtered(dao.observeObservations(query.subjectId.value).first(), query))
    }.sanitized("LOCAL_QUERY_FAILED")

    override fun observe(query: TimelineQuery): Flow<List<Observation>> = dao.observeObservations(query.subjectId.value).map { entities -> filtered(entities, query) }

    private fun filtered(entities: List<ObservationEntity>, query: TimelineQuery): List<Observation> =
        entities.asSequence().map(::toDomain)
            .filter { item -> query.kinds.isEmpty() || item.kind in query.kinds }
            .filter { item -> query.interval == null || item.interval.endExclusive.value >= query.interval.start.value && item.interval.start.value < query.interval.endExclusive.value }
            .toList()

    override suspend fun tombstone(subjectId: SubjectId, kinds: Set<ObservationKind>): Result<DomainError, Int> = runCatching {
        val names = kinds.map(ObservationKind::name)
        val at = nowEpochMs()
        val deleted = dao.tombstoneObservations(subjectId.value, names.ifEmpty { listOf("") }, if (kinds.isEmpty()) 1 else 0, at)
        dao.appendTombstone(TombstoneEntity("tombstone:${UUID.randomUUID()}", subjectId.value,
            names.sorted().joinToString(",").ifBlank { "*" }, at, null))
        Result.Ok(deleted)
    }.sanitized("LOCAL_TOMBSTONE_FAILED")

    override suspend fun deleteDerived(subjectId: SubjectId): Result<DomainError, Unit> = runCatching {
        dao.deleteMetrics(subjectId.value)
        dao.deleteBaselines(subjectId.value)
        dao.deleteInsights(subjectId.value)
        Result.Ok(Unit)
    }.sanitized("LOCAL_DERIVED_DELETE_FAILED")

    private fun toEntity(item: Observation): ObservationEntity = ObservationEntity(
        item.id.value, item.subjectId.value, item.kind.name, item.unit.name, item.interval.start.value, item.interval.endExclusive.value,
        cipher.encryptText(DomainJson.observationValue(item.value), "observation:${item.id.value}:value"),
        cipher.encryptText(DomainJson.provenance(item.provenance), "observation:${item.id.value}:provenance"),
        cipher.encryptText(DomainJson.quality(item.quality), "observation:${item.id.value}:quality"),
        item.quality.score, item.consentId.value, item.ingestedAt.value, item.supersedes?.value,
        item.provenance.sourcePlatform, item.provenance.platformRecordId,
    )

    private fun toDomain(entity: ObservationEntity): Observation = Observation(
        ObservationId(entity.id), SubjectId(entity.subjectId), ObservationKind.valueOf(entity.kind),
        DomainJson.observationValue(cipher.decryptText(entity.encryptedPayload, "observation:${entity.id}:value")),
        UnitCode.valueOf(entity.unit), TimeInterval.of(entity.startEpochMs, entity.endEpochMs).getOrNull() ?: error("Stored interval invalid"),
        DomainJson.provenance(cipher.decryptText(entity.encryptedProvenance, "observation:${entity.id}:provenance")),
        DomainJson.quality(cipher.decryptText(entity.encryptedQuality, "observation:${entity.id}:quality")),
        ConsentId(entity.consentId), InstantMs(entity.ingestedAtEpochMs), entity.supersedesId?.let(::ObservationId),
    )
}

class RoomMetricStore(private val dao: HealthDao, private val cipher: SensitivePayloadCipher) : MetricStorePort {
    override suspend fun append(metrics: List<DerivedMetric>): Result<DomainError, Int> = runCatching {
        dao.insertMetrics(metrics.map { metric ->
            MetricEntity(metric.id, metric.subjectId.value, metric.metricId.value, metric.value, metric.unit.name,
                metric.interval.start.value, metric.interval.endExclusive.value,
                cipher.encryptText(DomainJson.metricDetail(metric), "metric:${metric.id}"), metric.quality.score)
        })
        Result.Ok(metrics.size)
    }.sanitized("LOCAL_METRIC_APPEND_FAILED")

    override suspend fun query(subjectId: SubjectId, metricIds: Set<MetricId>, interval: TimeInterval?): Result<DomainError, List<DerivedMetric>> = runCatching {
        Result.Ok(filtered(dao.observeMetrics(subjectId.value).first(), metricIds, interval))
    }.sanitized("LOCAL_METRIC_QUERY_FAILED")

    override fun observe(subjectId: SubjectId, metricIds: Set<MetricId>, interval: TimeInterval?): Flow<List<DerivedMetric>> =
        dao.observeMetrics(subjectId.value).map { entities -> filtered(entities, metricIds, interval) }

    private fun filtered(entities: List<MetricEntity>, metricIds: Set<MetricId>, interval: TimeInterval?): List<DerivedMetric> =
        entities.map { entity -> DomainJson.metric(entity, cipher.decryptText(entity.encryptedDetail, "metric:${entity.id}")) }
            .filter { metricIds.isEmpty() || it.metricId in metricIds }
            .filter { interval == null || it.interval.endExclusive.value >= interval.start.value && it.interval.start.value < interval.endExclusive.value }

    override suspend fun saveBaseline(baseline: PersonalBaseline): Result<DomainError, Unit> = runCatching {
        val id = "${baseline.subjectId.value}:${baseline.metricId.value}"
        val payload = JSONObject().put("median", baseline.median).put("mad", baseline.mad)
            .put("sampleCount", baseline.sampleCount).put("inputMetricIds", JSONArray(baseline.inputMetricIds)).put("version", baseline.version).toString()
        dao.putBaseline(BaselineEntity(baseline.subjectId.value, baseline.metricId.value, baseline.interval.start.value,
            baseline.interval.endExclusive.value, cipher.encryptText(payload, "baseline:$id"), System.currentTimeMillis()))
        Result.Ok(Unit)
    }.sanitized("LOCAL_BASELINE_SAVE_FAILED")

    override suspend fun saveInsight(insight: Insight): Result<DomainError, Unit> = runCatching {
        val payload = JSONObject().put("confidence", insight.confidence.name)
            .put("facts", JSONArray(insight.facts.map { JSONObject().put("id", it.id).put("metricId", it.metricId.value).put("value", it.value).put("unit", it.unit.name) }))
            .put("trends", JSONArray(insight.trends.map { JSONObject().put("metricId", it.metricId.value).put("direction", it.direction).put("statement", it.statement) }))
            .put("actions", JSONArray(insight.actions.map { JSONObject().put("id", it.id).put("text", it.text).put("window", it.evaluationWindow) }))
            .put("redFlags", JSONArray(insight.redFlags.map { JSONObject().put("id", it.id).put("message", it.message) }))
            .put("limitations", JSONArray(insight.limitations)).toString()
        dao.putInsight(InsightEntity(insight.id, insight.subjectId.value, cipher.encryptText(payload, "insight:${insight.id}"), System.currentTimeMillis()))
        Result.Ok(Unit)
    }.sanitized("LOCAL_INSIGHT_SAVE_FAILED")
}

class RoomConsentStore(private val dao: HealthDao, private val cipher: SensitivePayloadCipher) : ConsentStorePort {
    override suspend fun grant(subjectId: SubjectId, purpose: String, scopes: Set<DataScope>, at: InstantMs): Result<DomainError, ConsentId> = runCatching {
        val id = "consent:${UUID.randomUUID()}"
        val scopeJson = JSONArray(scopes.sortedBy { it.id }.map { JSONObject().put("id", it.id).put("platform", it.platformValue) }).toString()
        dao.putConsent(ConsentEntity(id, subjectId.value, purpose, cipher.encryptText(scopeJson, "consent:$id"), at.value, null))
        Result.Ok(ConsentId(id))
    }.sanitized("CONSENT_GRANT_FAILED")

    override suspend fun revoke(subjectId: SubjectId, purpose: String, at: InstantMs): Result<DomainError, Unit> = runCatching {
        dao.revokeConsent(subjectId.value, purpose, at.value)
        Result.Ok(Unit)
    }.sanitized("CONSENT_REVOKE_FAILED")

    override suspend fun activeConsent(subjectId: SubjectId, purpose: String): ConsentId? = dao.activeConsent(subjectId.value, purpose)?.id?.let(::ConsentId)
}

class RoomCapabilityStore(private val dao: HealthDao, private val cipher: SensitivePayloadCipher) : CapabilityStorePort {
    override suspend fun put(id: String, capability: Capability, observedAt: InstantMs): Result<DomainError, Unit> = runCatching {
        val (state, detail) = capability.encode()
        dao.putCapability(CapabilityEntity(id, state, cipher.encryptText(detail, "capability:$id"), observedAt.value))
        Result.Ok(Unit)
    }.sanitized("CAPABILITY_SAVE_FAILED")

    override suspend fun get(id: String): Capability = dao.capability(id)?.decode(cipher) ?: Capability.Unknown
    override fun observeAll(): Flow<Map<String, Capability>> = dao.observeCapabilities().map { entities -> entities.associate { it.id to it.decode(cipher) } }

    private fun Capability.encode(): Pair<String, String> = when (this) {
        Capability.Unknown -> "unknown" to "{}"
        is Capability.Available -> "available" to JSONObject(metadata).toString()
        is Capability.RequiresPermission -> "permission" to JSONArray(scopes.toList()).toString()
        is Capability.RequiresApproval -> "approval" to service
        is Capability.Unsupported -> "unsupported" to reason
        is Capability.TemporarilyUnavailable -> "temporary" to JSONObject().put("reason", reason).put("retryAfter", retryAfter?.value).toString()
    }

    private fun CapabilityEntity.decode(cipher: SensitivePayloadCipher): Capability {
        val detail = cipher.decryptText(encryptedDetail, "capability:$id")
        return when (state) {
            "available" -> JSONObject(detail).let { json -> Capability.Available(json.keys().asSequence().associateWith(json::getString)) }
            "permission" -> Capability.RequiresPermission((0 until JSONArray(detail).length()).map { JSONArray(detail).getString(it) }.toSet())
            "approval" -> Capability.RequiresApproval(detail)
            "unsupported" -> Capability.Unsupported(detail)
            "temporary" -> JSONObject(detail).let { Capability.TemporarilyUnavailable(it.getString("reason"), if (it.isNull("retryAfter")) null else InstantMs(it.getLong("retryAfter"))) }
            else -> Capability.Unknown
        }
    }
}

class RoomCursorStore(private val dao: HealthDao, private val cipher: SensitivePayloadCipher) : SyncCursorPort {
    override suspend fun read(source: String, dataType: String, subjectId: SubjectId): SyncCursor? = dao.cursor(source, dataType, subjectId.value)?.let {
        SyncCursor(it.source, it.dataType, SubjectId(it.subjectId), cipher.decryptText(it.encryptedValue, "cursor:${it.source}:${it.dataType}:${it.subjectId}"), InstantMs(it.successfulAtEpochMs))
    }
    override suspend fun write(cursor: SyncCursor): Result<DomainError, Unit> = runCatching {
        val aad = "cursor:${cursor.source}:${cursor.dataType}:${cursor.subjectId.value}"
        dao.putCursor(CursorEntity(cursor.source, cursor.dataType, cursor.subjectId.value, cipher.encryptText(cursor.opaqueValue, aad), cursor.lastSuccessfulSync.value))
        Result.Ok(Unit)
    }.sanitized("CURSOR_SAVE_FAILED")
}

class RoomAudit(private val dao: HealthDao, private val cipher: SensitivePayloadCipher) : AuditPort {
    override suspend fun append(event: AuditEvent): Result<DomainError, Unit> = runCatching {
        val payload = JSONObject().put("subject", event.subjectPseudonym).put("metadata", JSONObject(event.metadata)).toString()
        dao.appendAudit(AuditEntity(type = event.type, createdAtEpochMs = event.at.value,
            encryptedSubjectAndMetadata = cipher.encryptText(payload, "audit:${event.type}:${event.at.value}")))
        Result.Ok(Unit)
    }.sanitized("AUDIT_APPEND_FAILED")
}
