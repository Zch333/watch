package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.RawPlatformRecord

object HuaweiRecordNormalizer {
    fun normalize(record: RawPlatformRecord, consentId: ConsentId, now: InstantMs): Result<DomainError, Observation> {
        val kind = runCatching { ObservationKind.valueOf(record.kind) }.getOrNull()
            ?: return Result.Err(DomainError("UNKNOWN_PLATFORM_DATA_TYPE", record.kind))
        val unit = runCatching { UnitCode.valueOf(record.unit) }.getOrNull()
            ?: return Result.Err(DomainError("UNKNOWN_UNIT", record.unit))
        val interval = TimeInterval.of(record.startEpochMs, record.endEpochMs)
        if (interval is Result.Err) return Result.Err(DomainError(interval.error))
        val value = parseValue(kind, record.valueJson) ?: return Result.Err(DomainError("RAW_VALUE_INVALID", record.kind))
        val preliminary = Observation(
            id = ObservationId("huawei:${record.platformRecordId}:${record.syncedAtEpochMs}"),
            subjectId = record.subjectId, kind = kind, value = value, unit = unit,
            interval = interval.getOrNull() ?: return Result.Err(DomainError("INTERVAL_INVALID")),
            provenance = Provenance(
                "huawei", "Huawei Health", record.sourceDeviceModel, record.sourceDevicePseudonym,
                record.firmwareVersion, record.apiName, record.apiVersion, record.kind, null, "wrist",
                if (kind.name.endsWith("VENDOR")) "Huawei" else null, null, record.platformRecordId,
                listOf("HuaweiHealth", "Move25Normalizer/1"),
            ),
            quality = assessQuality(1.0, (now.value - record.syncedAtEpochMs).coerceAtLeast(0), true, null, null, QualityPolicy("platform/1")),
            consentId = consentId, ingestedAt = now,
        )
        return validateObservation(preliminary)
    }

    private fun parseValue(kind: ObservationKind, raw: String): ObservationValue? {
        val scalar = raw.trim().toDoubleOrNull()
        if (scalar != null) return ObservationValue.Scalar(scalar)
        if (kind == ObservationKind.GPS_ROUTE) return null // Route JSON is parsed only by the native ACL mapper.
        if (kind in setOf(ObservationKind.SLEEP_STAGE_VENDOR, ObservationKind.MOOD, ObservationKind.MENSTRUAL_CYCLE, ObservationKind.WEAR_STATE)) {
            return raw.trim().takeIf { it.isNotBlank() }?.let(ObservationValue::Category)
        }
        return null
    }
}
