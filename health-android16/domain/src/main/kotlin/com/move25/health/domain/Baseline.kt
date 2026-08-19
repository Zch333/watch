package com.move25.health.domain

import kotlin.math.abs

data class PersonalBaseline(
    val subjectId: SubjectId,
    val metricId: MetricId,
    val interval: TimeInterval,
    val median: Double,
    val mad: Double,
    val sampleCount: Int,
    val inputMetricIds: List<String>,
    val version: String = "robust-baseline/1.0.0",
)

data class Deviation(
    val metricId: MetricId,
    val observed: Double,
    val baseline: Double,
    val absoluteDelta: Double,
    val percentageDelta: Double?,
    val robustZ: Double?,
    val unusual: Boolean,
    val direction: String,
)

fun buildBaseline(metrics: List<DerivedMetric>, minimumSamples: Int = 7): Result<DomainError, PersonalBaseline> {
    val qualified = metrics.filter { it.quality !is DataQuality.Rejected }
    if (qualified.size < minimumSamples) return Result.Err(DomainError("INSUFFICIENT_BASELINE_HISTORY"))
    if (qualified.map { it.subjectId }.distinct().size != 1 || qualified.map { it.metricId }.distinct().size != 1) {
        return Result.Err(DomainError("MIXED_BASELINE_SERIES"))
    }
    val center = median(qualified.map { it.value })
    val mad = median(qualified.map { abs(it.value - center) })
    val intervalResult = TimeInterval.of(
        qualified.minOf { it.interval.start.value },
        qualified.maxOf { it.interval.endExclusive.value },
    )
    if (intervalResult is Result.Err) return intervalResult
    val interval = intervalResult.getOrNull() ?: return Result.Err(DomainError("BASELINE_INTERVAL_INVALID"))
    return Result.Ok(PersonalBaseline(
        qualified.first().subjectId, qualified.first().metricId, interval, center, mad,
        qualified.size, qualified.map { it.id },
    ))
}

fun compareToBaseline(baseline: PersonalBaseline, metric: DerivedMetric, threshold: Double = 3.0): Result<DomainError, Deviation> {
    if (baseline.subjectId != metric.subjectId || baseline.metricId != metric.metricId) return Result.Err(DomainError("BASELINE_MISMATCH"))
    val delta = metric.value - baseline.median
    val robustZ = if (baseline.mad > 0) delta / (baseline.mad * 1.4826) else null
    return Result.Ok(Deviation(
        metric.metricId, metric.value, baseline.median, delta,
        baseline.median.takeIf { it != 0.0 }?.let { delta / it * 100.0 }, robustZ,
        robustZ?.let { abs(it) >= threshold } ?: false,
        when { delta > 0 -> "up"; delta < 0 -> "down"; else -> "stable" },
    ))
}

data class PersistentChange(
    val changed: Boolean,
    val direction: String,
    val persistence: Int,
    val robustScores: List<Double>,
    val medicalMeaning: String = "not_assessed",
)

fun detectPersistentChange(metrics: List<DerivedMetric>, baseline: PersonalBaseline, required: Int = 3): Result<DomainError, PersistentChange> {
    if (metrics.size < required || baseline.mad <= 0) return Result.Err(DomainError("INSUFFICIENT_CHANGE_EVIDENCE"))
    val scores = metrics.takeLast(required).map { (it.value - baseline.median) / (baseline.mad * 1.4826) }
    val up = scores.all { it >= 3.0 }
    val down = scores.all { it <= -3.0 }
    return Result.Ok(PersistentChange(up || down, if (up) "up" else if (down) "down" else "variable", required, scores))
}
