package com.move25.health.domain

import java.security.MessageDigest
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
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

private fun aggregateQuality(inputs: List<Observation>): DataQuality {
    if (inputs.any { it.quality is DataQuality.Rejected }) {
        return DataQuality.Rejected(listOf(QualityIssue(QualityDimension.SEMANTIC_VALIDITY, "REJECTED_INPUT", "存在被拒绝的输入")))
    }
    val score = inputs.map { it.quality.score }.average().takeIf { !it.isNaN() } ?: 0.0
    return if (score >= 0.85) DataQuality.Good(score, emptyMap())
    else DataQuality.Degraded(score, emptyMap(), listOf(QualityIssue(QualityDimension.COMPLETENESS, "AGGREGATE_DEGRADED", "输入质量部分降级")))
}

fun deriveMetric(
    metricId: String, value: Double, unit: UnitCode, inputs: List<Observation>,
    interval: TimeInterval, algorithmId: String, version: String, evidence: EvidenceGrade,
): Result<DomainError, DerivedMetric> {
    if (inputs.isEmpty()) return Result.Err(DomainError("NO_INPUTS"))
    val quality = aggregateQuality(inputs)
    if (quality is DataQuality.Rejected) return Result.Err(DomainError("QUALITY_REJECTED"))
    val hash = stableInputHash(inputs)
    return Result.Ok(DerivedMetric(
        id = "$metricId:$version:$hash", subjectId = inputs.first().subjectId,
        metricId = MetricId(metricId), value = value, unit = unit, interval = interval,
        algorithm = AlgorithmReference(algorithmId, version, "default", "source"),
        inputIds = inputs.map { it.id }, quality = quality, uncertainty = null,
        evidence = evidence, provenance = MetricProvenance(hash, "quality/1", "android-or-jvm"),
    ))
}

fun computeSum(metricId: String, kind: ObservationKind, inputs: List<Observation>, interval: TimeInterval, unit: UnitCode): Result<DomainError, DerivedMetric> {
    val qualified = inputs.filter { it.kind == kind && it.quality !is DataQuality.Rejected }
    val value = qualified.sumOf { (it.value as? ObservationValue.Scalar)?.number ?: 0.0 }
    return deriveMetric(metricId, value, unit, qualified, interval, "sum", "1.0.0", EvidenceGrade.E1_ENGINEERING)
}

fun computeMedian(metricId: String, kind: ObservationKind, inputs: List<Observation>, interval: TimeInterval, unit: UnitCode): Result<DomainError, DerivedMetric> {
    val qualified = inputs.filter { it.kind == kind && it.quality !is DataQuality.Rejected }
    val values = qualified.mapNotNull { (it.value as? ObservationValue.Scalar)?.number }
    if (values.isEmpty()) return Result.Err(DomainError("NO_QUALIFIED_VALUES"))
    return deriveMetric(metricId, median(values), unit, qualified, interval, "median", "1.0.0", EvidenceGrade.E1_ENGINEERING)
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
        if (ppgDerived) EvidenceGrade.E1_ENGINEERING else EvidenceGrade.E2_DEVICE_VALIDATED,
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
