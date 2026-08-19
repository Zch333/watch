package com.move25.health.domain

import java.security.MessageDigest
import java.nio.charset.StandardCharsets
import kotlin.math.pow
import kotlin.math.sqrt

data class AlgorithmReference(
    val id: String,
    val version: String,
    val parameterHash: String,
    val codeRevision: String,
)

data class MetricProvenance(
    val inputHash: String,
    val qualityPolicyVersion: String,
    val executionEnvironment: String,
)

data class DerivedMetric(
    val id: String,
    val subjectId: SubjectId,
    val metricId: MetricId,
    val value: Double,
    val unit: UnitCode,
    val interval: TimeInterval,
    val algorithm: AlgorithmReference,
    val inputIds: List<ObservationId>,
    val quality: DataQuality,
    val uncertainty: Double?,
    val evidence: EvidenceGrade,
    val provenance: MetricProvenance,
)

fun stableInputHash(inputs: List<Observation>): String {
    val canonical = inputs.sortedBy { it.id.value }.joinToString("\n") {
        "${it.id.value}|${it.kind}|${it.interval.start.value}|${it.interval.endExclusive.value}|${it.value}|${it.unit}"
    }
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

private fun aggregateQuality(inputs: List<Observation>): DataQuality {
    if (inputs.any { it.quality is DataQuality.Rejected }) {
        return DataQuality.Rejected(listOf(QualityIssue(QualityDimension.SEMANTIC_VALIDITY, "REJECTED_INPUT", "存在被拒绝的输入")))
    }
    val score = inputs.map { it.quality.score }.average().takeIf { !it.isNaN() } ?: 0.0
    val sourceDimensions = inputs.map { input -> when (val quality = input.quality) {
        is DataQuality.Good -> quality.dimensions
        is DataQuality.Degraded -> quality.dimensions
        is DataQuality.Rejected -> emptyMap()
    } }
    val dimensions = sourceDimensions.flatMap { it.keys }.toSet().associateWith { dimension ->
        sourceDimensions.mapNotNull { it[dimension] }.average()
    }
    return if (score >= 0.85 && inputs.all { it.quality is DataQuality.Good }) {
        DataQuality.Good(score, dimensions)
    } else {
        DataQuality.Degraded(score, dimensions, listOf(QualityIssue(QualityDimension.COMPLETENESS, "AGGREGATE_DEGRADED", "输入质量部分降级")))
    }
}

fun deriveMetric(
    metricId: String, value: Double, unit: UnitCode, inputs: List<Observation>,
    interval: TimeInterval, algorithmId: String, version: String, evidence: EvidenceGrade,
): Result<DomainError, DerivedMetric> {
    if (inputs.isEmpty()) return Result.Err(DomainError("NO_INPUTS"))
    if (metricId.isBlank() || algorithmId.isBlank() || version.isBlank() || !value.isFinite()) {
        return Result.Err(DomainError("METRIC_IDENTITY_OR_VALUE_INVALID"))
    }
    if (inputs.map(Observation::subjectId).distinct().size != 1) return Result.Err(DomainError("MIXED_METRIC_SUBJECTS"))
    if (inputs.any { validateObservation(it) is Result.Err }) return Result.Err(DomainError("INVALID_METRIC_INPUT"))
    if (inputs.none { it.interval.endExclusive.value >= interval.start.value && it.interval.start.value < interval.endExclusive.value }) {
        return Result.Err(DomainError("METRIC_INPUT_OUTSIDE_INTERVAL"))
    }
    val quality = aggregateQuality(inputs)
    if (quality is DataQuality.Rejected) return Result.Err(DomainError("QUALITY_REJECTED"))
    val hash = stableInputHash(inputs)
    return Result.Ok(DerivedMetric(
        id = "$metricId:$version:$hash", subjectId = inputs.first().subjectId,
        metricId = MetricId(metricId), value = value, unit = unit, interval = interval,
        algorithm = AlgorithmReference(algorithmId, version, "default", "source"),
        inputIds = inputs.map { it.id }.distinct().sortedBy { it.value }, quality = quality, uncertainty = null,
        evidence = evidence, provenance = MetricProvenance(hash, "quality/1", "android-or-jvm"),
    ))
}

fun computeSum(metricId: String, kind: ObservationKind, inputs: List<Observation>, interval: TimeInterval, unit: UnitCode): Result<DomainError, DerivedMetric> {
    val qualified = inputs.filter { it.kind == kind && it.quality !is DataQuality.Rejected }
        .mapNotNull { item -> (item.value as? ObservationValue.Scalar)?.number?.let { item to it } }
    if (qualified.isEmpty()) return Result.Err(DomainError("NO_QUALIFIED_VALUES"))
    return deriveMetric(metricId, qualified.sumOf { it.second }, unit, qualified.map { it.first }, interval,
        "sum", "1.0.0", EvidenceGrade.E1_ENGINEERING)
}

fun computeMedian(metricId: String, kind: ObservationKind, inputs: List<Observation>, interval: TimeInterval, unit: UnitCode): Result<DomainError, DerivedMetric> {
    val qualified = inputs.filter { it.kind == kind && it.quality !is DataQuality.Rejected }
        .mapNotNull { item -> (item.value as? ObservationValue.Scalar)?.number?.let { item to it } }
    if (qualified.isEmpty()) return Result.Err(DomainError("NO_QUALIFIED_VALUES"))
    return deriveMetric(metricId, median(qualified.map { it.second }), unit, qualified.map { it.first }, interval,
        "median", "1.0.0", EvidenceGrade.E1_ENGINEERING)
}

fun computeRmssd(inputs: List<Observation>, interval: TimeInterval, ppgDerived: Boolean): Result<DomainError, DerivedMetric> {
    val expectedKind = if (ppgDerived) ObservationKind.PPG_INTERVAL else ObservationKind.RRI
    val qualified = inputs.filter { it.kind == expectedKind && it.quality !is DataQuality.Rejected }
    val intervals = qualified.flatMap {
        when (val value = it.value) {
            is ObservationValue.Series -> value.values
            is ObservationValue.Scalar -> listOf(value.number)
            else -> emptyList()
        }
    }.filter { it in 250.0..2200.0 }
    if (intervals.size < 30) return Result.Err(DomainError("INSUFFICIENT_VALID_INTERVALS", intervals.size.toString()))
    val squaredDiffs = intervals.zipWithNext { a, b -> (b - a).pow(2) }
    val rmssd = sqrt(squaredDiffs.average())
    return deriveMetric(
        if (ppgDerived) "prv_rmssd" else "hrv_rmssd", rmssd, UnitCode.MILLISECOND,
        qualified, interval, if (ppgDerived) "ppg-prv-rmssd" else "rri-hrv-rmssd", "1.0.0",
        EvidenceGrade.E1_ENGINEERING,
    )
}

fun median(values: List<Double>): Double {
    require(values.isNotEmpty())
    val sorted = values.sorted()
    val middle = sorted.size / 2
    return if (sorted.size % 2 == 0) (sorted[middle - 1] + sorted[middle]) / 2 else sorted[middle]
}

fun mean(values: List<Double>): Double = values.average()

fun haversineMeters(a: RoutePoint, b: RoutePoint): Double {
    val radius = 6_371_000.0
    val lat1 = Math.toRadians(a.latitude)
    val lat2 = Math.toRadians(b.latitude)
    val dLat = lat2 - lat1
    val dLon = Math.toRadians(b.longitude - a.longitude)
    val h = kotlin.math.sin(dLat / 2).pow(2) + kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * kotlin.math.sin(dLon / 2).pow(2)
    return 2 * radius * kotlin.math.asin(sqrt(h))
}
