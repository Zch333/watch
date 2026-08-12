package com.move25.health.domain

enum class ObservationKind {
    HEART_RATE, RESTING_HEART_RATE, RRI, PPG_INTERVAL, HRV_VENDOR,
    SPO2, RESPIRATORY_RATE, SKIN_TEMPERATURE, BODY_TEMPERATURE,
    STEP_COUNT, ACTIVE_MINUTES, SEDENTARY_MINUTES, STRESS_VENDOR,
    SLEEP_DURATION, SLEEP_START_MINUTE, SLEEP_END_MINUTE, SLEEP_STAGE_VENDOR,
    WORKOUT_DURATION, WORKOUT_DISTANCE, WORKOUT_PACE, WORKOUT_SPEED,
    WORKOUT_ELEVATION, WORKOUT_CADENCE, WORKOUT_CALORIES, GPS_ROUTE,
    VO2MAX_VENDOR, MOOD, MENSTRUAL_CYCLE,
    EXTERNAL_BLOOD_PRESSURE, EXTERNAL_BLOOD_GLUCOSE,
    ACCELEROMETER, GYROSCOPE, PPG_RAW, ECG_RAW, WEAR_STATE,
}

enum class UnitCode {
    BPM, MILLISECOND, PERCENT, CELSIUS, COUNT, MINUTE, SECOND,
    METER, KILOMETER, METER_PER_SECOND, MINUTE_PER_KILOMETER,
    KCAL, SCORE, MILLIMETER_MERCURY, MILLIMOLE_PER_LITER,
    METER_PER_SECOND_SQUARED, RADIAN_PER_SECOND, VOLT, UNITLESS,
}

sealed interface ObservationValue {
    data class Scalar(val number: Double) : ObservationValue
    data class Series(val values: List<Double>, val sampleRateHz: Double?) : ObservationValue
    data class Category(val value: String) : ObservationValue
    data class BloodPressure(val systolic: Double, val diastolic: Double) : ObservationValue
    data class Route(val points: List<RoutePoint>) : ObservationValue
}

data class RoutePoint(val epochMs: Long, val latitude: Double, val longitude: Double, val altitudeM: Double?)

data class Provenance(
    val sourcePlatform: String,
    val sourceApp: String,
    val sourceDeviceModel: String,
    val sourceDeviceIdPseudonym: String,
    val firmwareVersion: String?,
    val apiName: String,
    val apiVersion: String,
    val originalDataType: String,
    val samplingRateHz: Double?,
    val sensorLocation: String?,
    val algorithmVendor: String?,
    val algorithmVersion: String?,
    val platformRecordId: String,
    val processingChain: List<String> = emptyList(),
)

data class Observation(
    val id: ObservationId,
    val subjectId: SubjectId,
    val kind: ObservationKind,
    val value: ObservationValue,
    val unit: UnitCode,
    val interval: TimeInterval,
    val provenance: Provenance,
    val quality: DataQuality,
    val consentId: ConsentId,
    val ingestedAt: InstantMs,
    val supersedes: ObservationId? = null,
)

fun validateObservation(item: Observation): Result<DomainError, Observation> {
    if (item.id.value.isBlank() || item.subjectId.value.isBlank()) return Result.Err(DomainError("IDENTITY_REQUIRED"))
    if (item.provenance.platformRecordId.isBlank() || item.provenance.apiName.isBlank()) return Result.Err(DomainError("PROVENANCE_REQUIRED"))
    if (item.consentId.value.isBlank()) return Result.Err(DomainError("CONSENT_REQUIRED"))
    val semanticError = when (val value = item.value) {
        is ObservationValue.Scalar -> when (item.kind) {
            ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE -> value.number !in 20.0..260.0
            ObservationKind.SPO2 -> value.number !in 0.0..100.0
            ObservationKind.SKIN_TEMPERATURE, ObservationKind.BODY_TEMPERATURE -> value.number !in 20.0..45.0
            ObservationKind.STEP_COUNT -> value.number < 0
            else -> !value.number.isFinite()
        }
        is ObservationValue.Series -> value.values.isEmpty() || value.values.any { !it.isFinite() }
        is ObservationValue.BloodPressure -> value.diastolic <= 0 || value.systolic <= value.diastolic
        is ObservationValue.Route -> value.points.any { it.latitude !in -90.0..90.0 || it.longitude !in -180.0..180.0 }
        is ObservationValue.Category -> value.value.isBlank()
    }
    return if (semanticError) Result.Err(DomainError("SEMANTIC_VALUE_INVALID")) else Result.Ok(item)
}

fun deduplicateTimeline(records: List<Observation>): List<Observation> =
    records.groupBy { "${it.provenance.sourcePlatform}|${it.provenance.platformRecordId}" }
        .values.map { versions -> versions.maxBy { it.ingestedAt.value } }
        .sortedWith(compareBy<Observation>({ it.interval.start.value }, { it.id.value }))

fun window(records: List<Observation>, interval: TimeInterval): List<Observation> =
    records.filter { it.interval.endExclusive.value >= interval.start.value && it.interval.start.value < interval.endExclusive.value }

sealed interface TimelineEntry {
    data class Current(val observation: Observation) : TimelineEntry
    data class Superseded(val observation: Observation, val replacementId: ObservationId) : TimelineEntry
    data class Deleted(val observationId: ObservationId, val deletedAt: InstantMs, val reason: String) : TimelineEntry
}

fun resolveTimeline(entries: List<TimelineEntry>): List<Observation> {
    val removed = entries.mapNotNull {
        when (it) {
            is TimelineEntry.Superseded -> it.observation.id
            is TimelineEntry.Deleted -> it.observationId
            is TimelineEntry.Current -> null
        }
    }.toSet()
    val current = entries.mapNotNull {
        when (it) {
            is TimelineEntry.Current -> it.observation
            is TimelineEntry.Superseded -> it.observation.copy(id = it.replacementId, supersedes = it.observation.id)
            is TimelineEntry.Deleted -> null
        }
    }.filter { it.id !in removed }
    return deduplicateTimeline(current)
}
