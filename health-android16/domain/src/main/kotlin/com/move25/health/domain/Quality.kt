package com.move25.health.domain

enum class QualityDimension {
    COMPLETENESS, TIMELINESS, SIGNAL_QUALITY, WEAR_QUALITY,
    TEMPORAL_CONSISTENCY, SEMANTIC_VALIDITY, DEVICE_APPLICABILITY, CROSS_SOURCE_AGREEMENT
}

data class QualityIssue(
    val dimension: QualityDimension,
    val code: String,
    val description: String,
)

sealed interface DataQuality {
    val score: Double
    data class Good(override val score: Double, val dimensions: Map<QualityDimension, Double>) : DataQuality
    data class Degraded(
        override val score: Double,
        val dimensions: Map<QualityDimension, Double>,
        val reasons: List<QualityIssue>,
    ) : DataQuality
    data class Rejected(val reasons: List<QualityIssue>) : DataQuality { override val score: Double = 0.0 }
}

data class QualityPolicy(
    val id: String,
    val minimumCoverage: Double = 0.7,
    val maximumLatencyMs: Long = 48L * 60 * 60 * 1000,
    val requiredDimensions: Set<QualityDimension> = setOf(QualityDimension.SEMANTIC_VALIDITY),
    val rejectionThreshold: Double = 0.4,
)

fun assessQuality(
    coverage: Double,
    latencyMs: Long,
    semanticValid: Boolean,
    wearConfirmed: Boolean?,
    signalScore: Double?,
    policy: QualityPolicy,
): DataQuality {
    val dimensions = buildMap {
        put(QualityDimension.COMPLETENESS, coverage.coerceIn(0.0, 1.0))
        put(QualityDimension.TIMELINESS, if (latencyMs <= policy.maximumLatencyMs) 1.0 else 0.3)
        put(QualityDimension.SEMANTIC_VALIDITY, if (semanticValid) 1.0 else 0.0)
        wearConfirmed?.let { put(QualityDimension.WEAR_QUALITY, if (it) 1.0 else 0.0) }
        signalScore?.let { put(QualityDimension.SIGNAL_QUALITY, it.coerceIn(0.0, 1.0)) }
    }
    val issues = buildList {
        if (coverage < policy.minimumCoverage) add(QualityIssue(QualityDimension.COMPLETENESS, "LOW_COVERAGE", "有效窗口覆盖不足"))
        if (latencyMs > policy.maximumLatencyMs) add(QualityIssue(QualityDimension.TIMELINESS, "STALE_DATA", "数据同步延迟过高"))
        if (!semanticValid) add(QualityIssue(QualityDimension.SEMANTIC_VALIDITY, "INVALID_SEMANTICS", "单位、范围或类型语义无效"))
        if (wearConfirmed == false) add(QualityIssue(QualityDimension.WEAR_QUALITY, "NOT_WORN", "设备未确认佩戴"))
        if (signalScore != null && signalScore < 0.5) add(QualityIssue(QualityDimension.SIGNAL_QUALITY, "POOR_SIGNAL", "信号质量不足"))
    }
    val score = dimensions.values.average().takeIf { !it.isNaN() } ?: 0.0
    val requiredFailed = policy.requiredDimensions.any { (dimensions[it] ?: 0.0) < policy.rejectionThreshold }
    return when {
        requiredFailed || !semanticValid -> DataQuality.Rejected(issues)
        issues.isEmpty() && score >= 0.85 -> DataQuality.Good(score, dimensions)
        else -> DataQuality.Degraded(score, dimensions, issues)
    }
}
