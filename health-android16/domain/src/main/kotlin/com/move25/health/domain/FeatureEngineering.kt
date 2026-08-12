package com.move25.health.domain

import kotlin.math.abs
import kotlin.math.max

private fun qualifiedScalars(inputs: List<Observation>, kind: ObservationKind): List<Pair<Observation, Double>> =
    inputs.filter { it.kind == kind && it.quality !is DataQuality.Rejected }
        .mapNotNull { item -> (item.value as? ObservationValue.Scalar)?.number?.let { item to it } }

private fun metricFrom(
    id: String,
    value: Double,
    unit: UnitCode,
    inputs: List<Observation>,
    interval: TimeInterval,
    algorithm: String,
    evidence: EvidenceGrade = EvidenceGrade.E1_ENGINEERING,
): Result<DomainError, DerivedMetric> = deriveMetric(id, value, unit, inputs, interval, algorithm, "1.0.0", evidence)

fun computeActivityMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> = listOf(
    computeSum("steps", ObservationKind.STEP_COUNT, inputs, interval, UnitCode.COUNT),
    computeSum("active_minutes", ObservationKind.ACTIVE_MINUTES, inputs, interval, UnitCode.MINUTE),
    computeSum("sedentary_minutes", ObservationKind.SEDENTARY_MINUTES, inputs, interval, UnitCode.MINUTE),
)

fun computeHeartRateMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val heart = qualifiedScalars(inputs, ObservationKind.HEART_RATE)
    val resting = qualifiedScalars(inputs, ObservationKind.RESTING_HEART_RATE)
    val results = mutableListOf<Result<DomainError, DerivedMetric>>()
    if (heart.isNotEmpty()) {
        val values = heart.map { it.second }
        results += metricFrom("heart_rate_median", median(values), UnitCode.BPM, heart.map { it.first }, interval, "heart-rate-median")
        results += metricFrom("heart_rate_min", values.min(), UnitCode.BPM, heart.map { it.first }, interval, "heart-rate-min")
        results += metricFrom("heart_rate_max", values.max(), UnitCode.BPM, heart.map { it.first }, interval, "heart-rate-max")
        val zoneMinutes = heart.zipWithNext().sumOf { (left, right) ->
            if (left.second >= 120.0) ((right.first.interval.start.value - left.first.interval.start.value).coerceIn(0, 300_000) / 60_000.0) else 0.0
        }
        results += metricFrom("elevated_hr_minutes", zoneMinutes, UnitCode.MINUTE, heart.map { it.first }, interval, "threshold-time-in-zone")
    }
    if (resting.isNotEmpty()) {
        results += metricFrom("resting_heart_rate", median(resting.map { it.second }), UnitCode.BPM, resting.map { it.first }, interval, "resting-heart-rate-median")
    }
    return results.ifEmpty { listOf(Result.Err(DomainError("NO_HEART_RATE_INPUTS"))) }
}

fun computeSleepMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val durations = qualifiedScalars(inputs, ObservationKind.SLEEP_DURATION)
    val starts = qualifiedScalars(inputs, ObservationKind.SLEEP_START_MINUTE)
    val results = mutableListOf<Result<DomainError, DerivedMetric>>()
    if (durations.isNotEmpty()) {
        val values = durations.map { it.second }
        results += metricFrom("sleep_duration", values.sum(), UnitCode.MINUTE, durations.map { it.first }, interval, "sleep-duration-sum")
        results += metricFrom("sleep_debt", max(0.0, 480.0 - values.sum()), UnitCode.MINUTE, durations.map { it.first }, interval, "adult-reference-sleep-debt")
    }
    if (starts.size >= 2) {
        val circularDiffs = starts.map { it.second }.zipWithNext { a, b -> minOf(abs(a - b), 1_440.0 - abs(a - b)) }
        results += metricFrom("sleep_regularity", max(0.0, 100.0 - circularDiffs.average() / 7.2), UnitCode.SCORE, starts.map { it.first }, interval, "sleep-start-regularity")
    }
    return results.ifEmpty { listOf(Result.Err(DomainError("NO_SLEEP_INPUTS"))) }
}

fun computeOxygenMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val values = qualifiedScalars(inputs, ObservationKind.SPO2)
    if (values.isEmpty()) return listOf(Result.Err(DomainError("NO_SPO2_INPUTS")))
    return listOf(
        metricFrom("spo2_median", median(values.map { it.second }), UnitCode.PERCENT, values.map { it.first }, interval, "spo2-median"),
        metricFrom("spo2_min", values.minOf { it.second }, UnitCode.PERCENT, values.map { it.first }, interval, "spo2-min"),
        metricFrom("spo2_below_90_samples", values.count { it.second < 90.0 }.toDouble(), UnitCode.COUNT, values.map { it.first }, interval, "spo2-threshold-count"),
    )
}

fun computeStressMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val values = qualifiedScalars(inputs, ObservationKind.STRESS_VENDOR)
    if (values.isEmpty()) return listOf(Result.Err(DomainError("NO_STRESS_INPUTS")))
    return listOf(
        metricFrom("stress_mean", mean(values.map { it.second }), UnitCode.SCORE, values.map { it.first }, interval, "vendor-stress-mean", EvidenceGrade.E0_VENDOR_UNVERIFIED),
        metricFrom("stress_max", values.maxOf { it.second }, UnitCode.SCORE, values.map { it.first }, interval, "vendor-stress-max", EvidenceGrade.E0_VENDOR_UNVERIFIED),
    )
}

fun computeTemperatureMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val skin = qualifiedScalars(inputs, ObservationKind.SKIN_TEMPERATURE)
    val body = qualifiedScalars(inputs, ObservationKind.BODY_TEMPERATURE)
    return buildList {
        if (skin.isNotEmpty()) add(metricFrom("skin_temperature_median", median(skin.map { it.second }), UnitCode.CELSIUS, skin.map { it.first }, interval, "skin-temperature-median", EvidenceGrade.E0_VENDOR_UNVERIFIED))
        if (body.isNotEmpty()) add(metricFrom("body_temperature_median", median(body.map { it.second }), UnitCode.CELSIUS, body.map { it.first }, interval, "body-temperature-median", EvidenceGrade.E0_VENDOR_UNVERIFIED))
        if (isEmpty()) add(Result.Err(DomainError("NO_TEMPERATURE_INPUTS")))
    }
}

fun computeWorkoutMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> = listOf(
    computeSum("workout_minutes", ObservationKind.WORKOUT_DURATION, inputs, interval, UnitCode.MINUTE),
    computeSum("workout_distance", ObservationKind.WORKOUT_DISTANCE, inputs, interval, UnitCode.KILOMETER),
    computeSum("workout_calories", ObservationKind.WORKOUT_CALORIES, inputs, interval, UnitCode.KCAL),
)

fun computeTrainingLoad(inputs: List<Observation>, interval: TimeInterval): Result<DomainError, DerivedMetric> {
    val duration = qualifiedScalars(inputs, ObservationKind.WORKOUT_DURATION)
    val heart = qualifiedScalars(inputs, ObservationKind.HEART_RATE)
    if (duration.isEmpty() || heart.isEmpty()) return Result.Err(DomainError("TRAINING_LOAD_REQUIRES_DURATION_AND_HEART_RATE"))
    val intensity = ((median(heart.map { it.second }) - 60.0) / 100.0).coerceIn(0.0, 1.5)
    return metricFrom("training_load", duration.sumOf { it.second } * intensity, UnitCode.SCORE,
        (duration.map { it.first } + heart.map { it.first }).distinctBy { it.id }, interval, "duration-heart-rate-load", EvidenceGrade.E1_ENGINEERING)
}

fun computeHeartRateRecovery(inputs: List<Observation>, interval: TimeInterval): Result<DomainError, DerivedMetric> {
    val values = qualifiedScalars(inputs, ObservationKind.HEART_RATE).sortedBy { it.first.interval.start.value }
    if (values.size < 2) return Result.Err(DomainError("INSUFFICIENT_POST_WORKOUT_HEART_RATE"))
    val peak = values.maxBy { it.second }
    val minuteLater = values.firstOrNull { it.first.interval.start.value >= peak.first.interval.start.value + 60_000 }
        ?: return Result.Err(DomainError("MISSING_ONE_MINUTE_HEART_RATE"))
    return metricFrom("heart_rate_recovery_1m", peak.second - minuteLater.second, UnitCode.BPM,
        listOf(peak.first, minuteLater.first), interval, "one-minute-heart-rate-recovery", EvidenceGrade.E1_ENGINEERING)
}

fun computeRouteMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val routes = inputs.filter { it.kind == ObservationKind.GPS_ROUTE && it.quality !is DataQuality.Rejected }
        .mapNotNull { item -> (item.value as? ObservationValue.Route)?.let { item to it.points.sortedBy(RoutePoint::epochMs) } }
    if (routes.isEmpty()) return listOf(Result.Err(DomainError("NO_ROUTE_INPUTS")))
    val distance = routes.sumOf { (_, points) -> points.zipWithNext(::haversineMeters).sum() }
    val elapsedSeconds = routes.sumOf { (_, points) -> if (points.size < 2) 0.0 else (points.last().epochMs - points.first().epochMs).coerceAtLeast(0) / 1_000.0 }
    return buildList {
        add(metricFrom("gps_distance", distance / 1_000.0, UnitCode.KILOMETER, routes.map { it.first }, interval, "gps-haversine-distance"))
        if (distance > 0 && elapsedSeconds > 0) add(metricFrom("gps_average_pace", elapsedSeconds / 60.0 / (distance / 1_000.0), UnitCode.MINUTE_PER_KILOMETER, routes.map { it.first }, interval, "gps-average-pace"))
    }
}

fun computeRespirationMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val values = qualifiedScalars(inputs, ObservationKind.RESPIRATORY_RATE)
    return if (values.isEmpty()) listOf(Result.Err(DomainError("NO_RESPIRATION_INPUTS")))
    else listOf(metricFrom("respiration_median", median(values.map { it.second }), UnitCode.COUNT, values.map { it.first }, interval, "respiration-median", EvidenceGrade.E0_VENDOR_UNVERIFIED))
}

fun computeVo2MaxMetrics(inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> {
    val values = qualifiedScalars(inputs, ObservationKind.VO2MAX_VENDOR)
    return if (values.isEmpty()) listOf(Result.Err(DomainError("NO_VO2MAX_INPUTS")))
    else listOf(metricFrom("vo2max_vendor_median", median(values.map { it.second }), UnitCode.MILLILITER_PER_KILOGRAM_MINUTE,
        values.map { it.first }, interval, "vendor-vo2max-median", EvidenceGrade.E0_VENDOR_UNVERIFIED))
}

fun computeRecoveryIndex(metrics: List<DerivedMetric>, interval: TimeInterval): Result<DomainError, DerivedMetric> {
    val usable = metrics.filter { it.quality !is DataQuality.Rejected }
    val hr = usable.lastOrNull { it.metricId.value == "resting_heart_rate" }
    val sleep = usable.lastOrNull { it.metricId.value == "sleep_duration" }
    val stress = usable.lastOrNull { it.metricId.value == "stress_mean" }
    if (listOf(hr, sleep, stress).count { it != null } < 2) return Result.Err(DomainError("INSUFFICIENT_RECOVERY_COMPONENTS"))
    val score = listOfNotNull(
        hr?.let { (100.0 - ((it.value - 45.0) / 55.0 * 100.0)).coerceIn(0.0, 100.0) },
        sleep?.let { (it.value / 480.0 * 100.0).coerceIn(0.0, 100.0) },
        stress?.let { (100.0 - it.value).coerceIn(0.0, 100.0) },
    ).average()
    val anchor = usable.flatMap { it.inputIds }.distinct()
    val hash = anchor.sortedBy { it.value }.joinToString("|") { it.value }.hashCode().toUInt().toString(16)
    return Result.Ok(DerivedMetric(
        id = "recovery_index:1.0.0:$hash", subjectId = usable.first().subjectId,
        metricId = MetricId("recovery_index"), value = score, unit = UnitCode.SCORE, interval = interval,
        algorithm = AlgorithmReference("explainable-recovery-index", "1.0.0", "equal-weight-available-components", "source"),
        inputIds = anchor, quality = usable.minBy { it.quality.score }.quality, uncertainty = null,
        evidence = EvidenceGrade.E1_ENGINEERING,
        provenance = MetricProvenance(hash, "quality/1", "android-or-jvm"),
    ))
}

fun computeFeatureGroup(groupId: String, inputs: List<Observation>, interval: TimeInterval): List<Result<DomainError, DerivedMetric>> = when (groupId) {
    "activity" -> computeActivityMetrics(inputs, interval)
    "heart_rate" -> computeHeartRateMetrics(inputs, interval)
    "sleep" -> computeSleepMetrics(inputs, interval)
    "spo2" -> computeOxygenMetrics(inputs, interval)
    "stress" -> computeStressMetrics(inputs, interval)
    "temperature" -> computeTemperatureMetrics(inputs, interval)
    "workout" -> computeWorkoutMetrics(inputs, interval) + listOf(computeTrainingLoad(inputs, interval), computeHeartRateRecovery(inputs, interval))
    "gps_route" -> computeRouteMetrics(inputs, interval)
    "respiration" -> computeRespirationMetrics(inputs, interval)
    "vo2max" -> computeVo2MaxMetrics(inputs, interval)
    "hrv" -> listOf(computeRmssd(inputs, interval, false))
    "prv" -> listOf(computeRmssd(inputs, interval, true))
    else -> listOf(Result.Err(DomainError("UNKNOWN_FEATURE_GROUP", groupId)))
}
