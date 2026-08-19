package com.move25.health.adapter.android

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(
    tableName = "observations",
    indices = [Index(value = ["subjectId", "startEpochMs"]), Index(value = ["sourcePlatform", "platformRecordId"], unique = true)],
)
data class ObservationEntity(
    @PrimaryKey val id: String,
    val subjectId: String,
    val kind: String,
    val unit: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val encryptedPayload: ByteArray,
    val encryptedProvenance: ByteArray,
    val encryptedQuality: ByteArray,
    val qualityScore: Double,
    val consentId: String,
    val ingestedAtEpochMs: Long,
    val supersedesId: String?,
    val sourcePlatform: String,
    val platformRecordId: String,
    val tombstonedAtEpochMs: Long? = null,
)

@Entity(tableName = "derived_metrics", indices = [Index(value = ["subjectId", "metricId", "startEpochMs"])])
data class MetricEntity(
    @PrimaryKey val id: String,
    val subjectId: String,
    val metricId: String,
    val value: Double,
    val unit: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val encryptedDetail: ByteArray,
    val qualityScore: Double,
)

@Entity(tableName = "personal_baselines", primaryKeys = ["subjectId", "metricId"])
data class BaselineEntity(
    val subjectId: String,
    val metricId: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val encryptedPayload: ByteArray,
    val updatedAtEpochMs: Long,
)

@Entity(tableName = "insights", indices = [Index("subjectId")])
data class InsightEntity(@PrimaryKey val id: String, val subjectId: String, val encryptedPayload: ByteArray, val createdAtEpochMs: Long)

@Entity(tableName = "consents", indices = [Index(value = ["subjectId", "purpose", "revokedAtEpochMs"])])
data class ConsentEntity(
    @PrimaryKey val id: String,
    val subjectId: String,
    val purpose: String,
    val encryptedScopes: ByteArray,
    val grantedAtEpochMs: Long,
    val revokedAtEpochMs: Long?,
)

@Entity(tableName = "capability_evidence")
data class CapabilityEntity(@PrimaryKey val id: String, val state: String, val encryptedDetail: ByteArray, val observedAtEpochMs: Long)

@Entity(tableName = "sync_cursors", primaryKeys = ["source", "dataType", "subjectId"])
data class CursorEntity(val source: String, val dataType: String, val subjectId: String, val encryptedValue: ByteArray, val successfulAtEpochMs: Long)

@Entity(tableName = "audit_events", indices = [Index("createdAtEpochMs")])
data class AuditEntity(
    @PrimaryKey(autoGenerate = true) val sequence: Long = 0,
    val type: String,
    val createdAtEpochMs: Long,
    val encryptedSubjectAndMetadata: ByteArray,
)

@Entity(tableName = "raw_quarantine", indices = [Index("receivedAtEpochMs")])
data class QuarantineEntity(
    @PrimaryKey(autoGenerate = true) val sequence: Long = 0,
    val source: String,
    val reasonCode: String,
    val encryptedPayload: ByteArray,
    val receivedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
)

@Entity(tableName = "deletion_tombstones", indices = [Index("subjectId")])
data class TombstoneEntity(
    @PrimaryKey val id: String,
    val subjectId: String,
    val kinds: String,
    val createdAtEpochMs: Long,
    val cloudAcknowledgedAtEpochMs: Long?,
)

@Dao
interface HealthDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertObservations(items: List<ObservationEntity>): List<Long>
    @Query("SELECT * FROM observations WHERE subjectId = :subjectId AND tombstonedAtEpochMs IS NULL ORDER BY startEpochMs, id")
    fun observeObservations(subjectId: String): Flow<List<ObservationEntity>>
    @Query("UPDATE observations SET tombstonedAtEpochMs = :at WHERE subjectId = :subjectId AND (:allKinds = 1 OR kind IN (:kinds)) AND tombstonedAtEpochMs IS NULL")
    suspend fun tombstoneObservations(subjectId: String, kinds: List<String>, allKinds: Int, at: Long): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertMetrics(items: List<MetricEntity>)
    @Query("SELECT * FROM derived_metrics WHERE subjectId = :subjectId ORDER BY startEpochMs, id")
    fun observeMetrics(subjectId: String): Flow<List<MetricEntity>>
    @Query("DELETE FROM derived_metrics WHERE subjectId = :subjectId") suspend fun deleteMetrics(subjectId: String)
    @Query("DELETE FROM personal_baselines WHERE subjectId = :subjectId") suspend fun deleteBaselines(subjectId: String)
    @Query("DELETE FROM insights WHERE subjectId = :subjectId") suspend fun deleteInsights(subjectId: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putBaseline(entity: BaselineEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putInsight(entity: InsightEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putConsent(entity: ConsentEntity)
    @Query("SELECT * FROM consents WHERE subjectId = :subjectId AND purpose = :purpose AND revokedAtEpochMs IS NULL ORDER BY grantedAtEpochMs DESC LIMIT 1")
    suspend fun activeConsent(subjectId: String, purpose: String): ConsentEntity?
    @Query("UPDATE consents SET revokedAtEpochMs = :at WHERE subjectId = :subjectId AND purpose = :purpose AND revokedAtEpochMs IS NULL")
    suspend fun revokeConsent(subjectId: String, purpose: String, at: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putCapability(entity: CapabilityEntity)
    @Query("SELECT * FROM capability_evidence WHERE id = :id") suspend fun capability(id: String): CapabilityEntity?
    @Query("SELECT * FROM capability_evidence") fun observeCapabilities(): Flow<List<CapabilityEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putCursor(entity: CursorEntity)
    @Query("SELECT * FROM sync_cursors WHERE source = :source AND dataType = :dataType AND subjectId = :subjectId")
    suspend fun cursor(source: String, dataType: String, subjectId: String): CursorEntity?
    @Insert suspend fun appendAudit(entity: AuditEntity)
    @Insert suspend fun appendTombstone(entity: TombstoneEntity)
    @Insert suspend fun appendQuarantine(entity: QuarantineEntity)
    @Query("DELETE FROM raw_quarantine WHERE expiresAtEpochMs <= :at") suspend fun purgeQuarantine(at: Long): Int
}

@Database(
    entities = [ObservationEntity::class, MetricEntity::class, BaselineEntity::class, InsightEntity::class,
        ConsentEntity::class, CapabilityEntity::class, CursorEntity::class, AuditEntity::class,
        QuarantineEntity::class, TombstoneEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class HealthDatabase : RoomDatabase() {
    abstract fun healthDao(): HealthDao
}
