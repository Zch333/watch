package com.move25.health.ports

import com.move25.health.domain.*
import kotlinx.coroutines.flow.Flow

data class DataScope(val id: String, val platformValue: String?)
data class ReadRequest(val subjectId: SubjectId, val kinds: Set<ObservationKind>, val interval: TimeInterval, val cursor: SyncCursor? = null)
data class SyncCursor(val source: String, val dataType: String, val subjectId: SubjectId, val opaqueValue: String, val lastSuccessfulSync: InstantMs)
data class RawPlatformRecord(
    val platformRecordId: String,
    val subjectId: SubjectId,
    val kind: String,
    val valueJson: String,
    val unit: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val sourceDeviceModel: String,
    val sourceDevicePseudonym: String,
    val firmwareVersion: String?,
    val apiName: String,
    val apiVersion: String,
    val syncedAtEpochMs: Long,
    val nextCursor: String? = null,
)
data class PlatformChange(val record: RawPlatformRecord, val supersedesPlatformRecordId: String?)
data class AuthorizationResult(val granted: Set<DataScope>, val denied: Set<DataScope>)

interface PlatformHealthPort {
    suspend fun capabilities(): Map<String, Capability>
    suspend fun requestAuthorization(scopes: Set<DataScope>): Result<DomainError, AuthorizationResult>
    fun read(request: ReadRequest): Flow<Result<DomainError, RawPlatformRecord>>
    fun changes(cursor: SyncCursor?): Flow<Result<DomainError, PlatformChange>>
    suspend fun revoke(scopes: Set<DataScope>): Result<DomainError, Unit>
}

data class WearableDevice(
    val idPseudonym: String,
    val name: String,
    val model: String,
    val connected: Boolean,
    val worn: Boolean?,
    val batteryPercent: Int?,
    val apiLevel: Int?,
)
data class SensorCapability(val id: String, val maximumSampleRateHz: Double?, val requiresApproval: Boolean)
data class SensorSample(val sessionId: String, val sequence: Long, val sensor: String, val epochMs: Long, val values: List<Double>, val confidence: Int?)

interface WatchSensorPort {
    suspend fun devices(): Result<DomainError, List<WearableDevice>>
    suspend fun listSensors(device: WearableDevice): Result<DomainError, List<SensorCapability>>
    fun open(device: WearableDevice, request: SensorSessionRequest): Flow<Result<DomainError, SensorSample>>
    suspend fun close(sessionId: String): Result<DomainError, Unit>
}

interface WatchMessagingPort {
    suspend fun ping(device: WearableDevice): Result<DomainError, Unit>
    suspend fun send(device: WearableDevice, envelope: WatchEnvelope): Result<DomainError, Unit>
    fun receive(device: WearableDevice): Flow<Result<DomainError, WatchEnvelope>>
}

data class AppendResult(val inserted: Int, val duplicates: Int)
data class TimelineQuery(val subjectId: SubjectId, val interval: TimeInterval?, val kinds: Set<ObservationKind> = emptySet())

interface TimelineStorePort {
    suspend fun append(batch: List<Observation>): Result<DomainError, AppendResult>
    suspend fun query(query: TimelineQuery): Result<DomainError, List<Observation>>
    fun observe(query: TimelineQuery): Flow<List<Observation>>
    suspend fun tombstone(subjectId: SubjectId, kinds: Set<ObservationKind> = emptySet()): Result<DomainError, Int>
    suspend fun deleteDerived(subjectId: SubjectId): Result<DomainError, Unit>
}

interface MetricStorePort {
    suspend fun append(metrics: List<DerivedMetric>): Result<DomainError, Int>
    suspend fun query(subjectId: SubjectId, metricIds: Set<MetricId>, interval: TimeInterval?): Result<DomainError, List<DerivedMetric>>
    fun observe(subjectId: SubjectId, metricIds: Set<MetricId>, interval: TimeInterval?): Flow<List<DerivedMetric>>
    suspend fun saveBaseline(baseline: PersonalBaseline): Result<DomainError, Unit>
    suspend fun saveInsight(insight: Insight): Result<DomainError, Unit>
}

interface ConsentStorePort {
    suspend fun grant(subjectId: SubjectId, purpose: String, scopes: Set<DataScope>, at: InstantMs): Result<DomainError, ConsentId>
    suspend fun revoke(subjectId: SubjectId, purpose: String, at: InstantMs): Result<DomainError, Unit>
    suspend fun activeConsent(subjectId: SubjectId, purpose: String): ConsentId?
}

interface CapabilityStorePort {
    suspend fun put(id: String, capability: Capability, observedAt: InstantMs): Result<DomainError, Unit>
    suspend fun get(id: String): Capability
    fun observeAll(): Flow<Map<String, Capability>>
}

interface FeatureFlagPort {
    fun observeUserEnabled(): Flow<Boolean>
    suspend fun setUserEnabled(enabled: Boolean): Result<DomainError, Unit>
    fun observeAiEnabled(): Flow<Boolean>
    suspend fun setAiEnabled(enabled: Boolean): Result<DomainError, Unit>
    fun observeResearchEnabled(): Flow<Boolean>
}

interface ClockPort { fun now(): InstantMs }
interface IdPort { fun next(prefix: String): String }
interface AuditPort { suspend fun append(event: AuditEvent): Result<DomainError, Unit> }
data class AuditEvent(val type: String, val at: InstantMs, val subjectPseudonym: String?, val metadata: Map<String, String>)

interface AiInferencePort { suspend fun complete(envelope: AiEnvelope): Result<DomainError, UntrustedAiOutput> }
interface NotificationPort { suspend fun publish(notification: HealthNotification): Result<DomainError, Unit> }
data class HealthNotification(val id: String, val title: String, val body: String, val redFlag: Boolean)

interface ExportPort {
    suspend fun exportJson(subjectId: SubjectId): Result<DomainError, ExportArtifact>
    suspend fun exportFhirResearch(subjectId: SubjectId, researchConsent: ConsentId): Result<DomainError, ExportArtifact>
}
data class ExportArtifact(val displayName: String, val mimeType: String, val bytes: ByteArray)

interface CloudDeletionPort { suspend fun deleteSubject(subjectId: SubjectId): Result<DomainError, Unit> }
interface QuarantinePort {
    suspend fun retain(source: String, reason: DomainError, encryptedPayloadCandidate: String, at: InstantMs): Result<DomainError, Unit>
    suspend fun purgeExpired(at: InstantMs): Result<DomainError, Int>
}
interface SyncCursorPort {
    suspend fun read(source: String, dataType: String, subjectId: SubjectId): SyncCursor?
    suspend fun write(cursor: SyncCursor): Result<DomainError, Unit>
}
