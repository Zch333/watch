package com.move25.health.adapter.android

import android.content.Context
import com.move25.health.ports.*

data class AndroidAdapters(
    val timeline: TimelineStorePort,
    val metrics: MetricStorePort,
    val consents: ConsentStorePort,
    val capabilities: CapabilityStorePort,
    val cursors: SyncCursorPort,
    val audit: AuditPort,
    val flags: FeatureFlagPort,
    val exports: ExportPort,
    val quarantine: QuarantinePort,
)

object AndroidAdapterFactory {
    fun create(context: Context, researchReleaseEnabled: Boolean): AndroidAdapters {
        val dao = HealthDatabaseFactory.create(context).healthDao()
        val cipher = AndroidKeystoreCipher()
        val timeline = RoomTimelineStore(dao, cipher)
        val metrics = RoomMetricStore(dao, cipher)
        return AndroidAdapters(
            timeline, metrics, RoomConsentStore(dao, cipher), RoomCapabilityStore(dao, cipher),
            RoomCursorStore(dao, cipher), RoomAudit(dao, cipher),
            AndroidFeatureFlags(context, researchReleaseEnabled), LocalExportAdapter(timeline, metrics),
            RoomQuarantine(dao, cipher),
        )
    }
}
