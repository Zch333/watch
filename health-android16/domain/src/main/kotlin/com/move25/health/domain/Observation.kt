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
    MILLILITER_PER_KILOGRAM_MINUTE,
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

private fun allowedUnits(kind: ObservationKind): Set<UnitCode> = when (kind) {
    ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE -> setOf(UnitCode.BPM)
    ObservationKind.RRI, ObservationKind.PPG_INTERVAL, ObservationKind.HRV_VENDOR -> setOf(UnitCode.MILLISECOND)
    ObservationKind.SPO2 -> setOf(UnitCode.PERCENT)
    ObservationKind.RESPIRATORY_RATE -> setOf(UnitCode.COUNT)
    ObservationKind.SKIN_TEMPERATURE, ObservationKind.BODY_TEMPERATURE -> setOf(UnitCode.CELSIUS)
    ObservationKind.STEP_COUNT -> setOf(UnitCode.COUNT)
    ObservationKind.ACTIVE_MINUTES, ObservationKind.SEDENTARY_MINUTES,
    ObservationKind.SLEEP_DURATION, ObservationKind.SLEEP_START_MINUTE,
    ObservationKind.SLEEP_END_MINUTE, ObservationKind.WORKOUT_DURATION -> setOf(UnitCode.MINUTE)
    ObservationKind.STRESS_VENDOR, ObservationKind.MOOD -> setOf(UnitCode.SCORE)
    ObservationKind.SLEEP_STAGE_VENDOR, ObservationKind.MENSTRUAL_CYCLE,
    ObservationKind.WEAR_STATE, ObservationKind.PPG_RAW -> setOf(UnitCode.UNITLESS)
    ObservationKind.WORKOUT_DISTANCE -> setOf(UnitCode.KILOMETER)
    ObservationKind.WORKOUT_PACE -> setOf(UnitCode.MINUTE_PER_KILOMETER)
    ObservationKind.WORKOUT_SPEED -> setOf(UnitCode.METER_PER_SECOND)
    ObservationKind.WORKOUT_ELEVATION -> setOf(UnitCode.METER)
    ObservationKind.WORKOUT_CADENCE -> setOf(UnitCode.COUNT)
    ObservationKind.WORKOUT_CALORIES -> setOf(UnitCode.KCAL)
    ObservationKind.GPS_ROUTE -> setOf(UnitCode.UNITLESS, UnitCode.METER, UnitCode.KILOMETER)
    ObservationKind.VO2MAX_VENDOR -> setOf(UnitCode.MILLILITER_PER_KILOGRAM_MINUTE)
    ObservationKind.EXTERNAL_BLOOD_PRESSURE -> setOf(UnitCode.MILLIMETER_MERCURY)
    ObservationKind.EXTERNAL_BLOOD_GLUCOSE -> setOf(UnitCode.MILLIMOLE_PER_LITER)
    ObservationKind.ACCELEROMETER -> setOf(UnitCode.METER_PER_SECOND_SQUARED)
    ObservationKind.GYROSCOPE -> setOf(UnitCode.RADIAN_PER_SECOND)
    ObservationKind.ECG_RAW -> setOf(UnitCode.VOLT)
}

private fun expectedValueType(kind: ObservationKind, value: ObservationValue): Boolean = when (kind) {
    ObservationKind.GPS_ROUTE -> value is ObservationValue.Route
    ObservationKind.EXTERNAL_BLOOD_PRESSURE -> value is ObservationValue.BloodPressure
    ObservationKind.SLEEP_STAGE_VENDOR, ObservationKind.MOOD,
    ObservationKind.MENSTRUAL_CYCLE, ObservationKind.WEAR_STATE -> value is ObservationValue.Category
    ObservationKind.ACCELEROMETER, ObservationKind.GYROSCOPE,
    ObservationKind.PPG_RAW, ObservationKind.ECG_RAW -> value is ObservationValue.Series
    ObservationKind.RRI, ObservationKind.PPG_INTERVAL ->
        value is ObservationValue.Scalar || value is ObservationValue.Series
    else -> value is ObservationValue.Scalar
}

private fun scalarSemanticsValid(kind: ObservationKind, number: Double): Boolean {
    if (!number.isFinite()) return false
    return when (kind) {
        ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE -> number in 20.0..260.0
        ObservationKind.RRI, ObservationKind.PPG_INTERVAL -> number in 250.0..2_200.0
        ObservationKind.HRV_VENDOR -> number in 0.0..500.0
        ObservationKind.SPO2 -> number in 0.0..100.0
        ObservationKind.RESPIRATORY_RATE -> number in 2.0..80.0
        ObservationKind.SKIN_TEMPERATURE, ObservationKind.BODY_TEMPERATURE -> number in 20.0..45.0
        ObservationKind.STEP_COUNT -> number in 0.0..500_000.0
        ObservationKind.ACTIVE_MINUTES, ObservationKind.SEDENTARY_MINUTES,
        ObservationKind.SLEEP_DURATION -> number in 0.0..1_440.0
        ObservationKind.SLEEP_START_MINUTE, ObservationKind.SLEEP_END_MINUTE -> number >= 0.0 && number < 1_440.0
        ObservationKind.STRESS_VENDOR -> number in 0.0..100.0
        ObservationKind.WORKOUT_DURATION -> number in 0.0..1_440.0
        ObservationKind.WORKOUT_DISTANCE, ObservationKind.WORKOUT_PACE,
        ObservationKind.WORKOUT_SPEED, ObservationKind.WORKOUT_CADENCE,
        ObservationKind.WORKOUT_CALORIES -> number >= 0.0
        ObservationKind.WORKOUT_ELEVATION -> number in -500.0..10_000.0
        ObservationKind.VO2MAX_VENDOR -> number in 1.0..100.0
        ObservationKind.EXTERNAL_BLOOD_GLUCOSE -> number in 0.1..50.0
        else -> true
    }
}

private fun qualityValid(quality: DataQuality): Boolean {
    val dimensions = when (quality) {
        is DataQuality.Good -> quality.dimensions
        is DataQuality.Degraded -> quality.dimensions
        is DataQuality.Rejected -> emptyMap()
    }
    return quality.score in 0.0..1.0 && dimensions.values.all { it.isFinite() && it in 0.0..1.0 }
}

fun validateObservation(item: Observation): Result<DomainError, Observation> {
    if (item.id.value.isBlank() || item.subjectId.value.isBlank()) return Result.Err(DomainError("IDENTITY_REQUIRED"))
    if (item.interval.start.value < 0 || item.interval.endExclusive.value < 0 || item.ingestedAt.value < 0) {
        return Result.Err(DomainError("OBSERVATION_TIME_INVALID"))
    }
    if (item.supersedes == item.id) return Result.Err(DomainError("OBSERVATION_CANNOT_SUPERSEDE_ITSELF"))
    if (item.provenance.sourcePlatform.isBlank() || item.provenance.sourceApp.isBlank() ||
        item.provenance.sourceDeviceModel.isBlank() || item.provenance.sourceDeviceIdPseudonym.isBlank() ||
        item.provenance.platformRecordId.isBlank() || item.provenance.apiName.isBlank() ||
        item.provenance.apiVersion.isBlank() || item.provenance.originalDataType.isBlank() ||
        item.provenance.processingChain.any(String::isBlank)
    ) return Result.Err(DomainError("PROVENANCE_REQUIRED"))
    if (item.consentId.value.isBlank()) return Result.Err(DomainError("CONSENT_REQUIRED"))
    if (item.unit !in allowedUnits(item.kind)) return Result.Err(DomainError("UNIT_KIND_MISMATCH"))
    if (!expectedValueType(item.kind, item.value)) return Result.Err(DomainError("VALUE_KIND_MISMATCH"))
    if (!qualityValid(item.quality)) return Result.Err(DomainError("QUALITY_INVALID"))
    val semanticError = when (val value = item.value) {
        is ObservationValue.Scalar -> !scalarSemanticsValid(item.kind, value.number)
        is ObservationValue.Series -> value.values.isEmpty() || value.values.any { sample ->
            !scalarSemanticsValid(item.kind, sample)
        } || value.sampleRateHz?.let { !it.isFinite() || it <= 0.0 } == true
        is ObservationValue.BloodPressure -> !value.systolic.isFinite() || !value.diastolic.isFinite() ||
            value.systolic !in 30.0..300.0 || value.diastolic !in 20.0..200.0 ||
            value.systolic <= value.diastolic
        is ObservationValue.Route -> value.points.isEmpty() || value.points.any {
            it.epochMs < 0 || !it.latitude.isFinite() || !it.longitude.isFinite() ||
                it.latitude !in -90.0..90.0 || it.longitude !in -180.0..180.0 ||
                it.altitudeM?.isFinite() == false
        } || value.points.zipWithNext().any { (left, right) -> right.epochMs < left.epochMs }
        is ObservationValue.Category -> value.value.isBlank() || value.value.length > 128
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
