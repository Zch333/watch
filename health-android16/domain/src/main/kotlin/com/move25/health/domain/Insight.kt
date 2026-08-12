package com.move25.health.domain

data class Fact(val id: String, val metricId: MetricId, val value: Double, val unit: UnitCode, val quality: DataQuality)
data class Trend(val metricId: MetricId, val direction: String, val statement: String)
data class ExplanationHypothesis(val text: String, val medicalClaim: Boolean = false)
data class LowRiskAction(val id: String, val text: String, val evaluationWindow: String)
data class RedFlag(val id: String, val message: String)

data class Insight(
    val id: String,
    val subjectId: SubjectId,
    val facts: List<Fact>,
    val trends: List<Trend>,
    val deviations: List<Deviation>,
    val possibleExplanations: List<ExplanationHypothesis>,
    val actions: List<LowRiskAction>,
    val redFlags: List<RedFlag>,
    val limitations: List<String>,
    val confidence: Confidence,
    val correlationIsNotCausation: Boolean = true,
)

data class SymptomReport(
    val chestPain: Boolean = false,
    val severeBreathingDifficulty: Boolean = false,
    val lossOfConsciousness: Boolean = false,
    val possibleStrokeSymptoms: Boolean = false,
)

fun deterministicRedFlags(report: SymptomReport): List<RedFlag> =
    if (report.chestPain || report.severeBreathingDifficulty || report.lossOfConsciousness || report.possibleStrokeSymptoms) {
        listOf(RedFlag("urgent_symptoms", "如症状严重或持续，请立即联系当地急救服务。手表读数正常也不能排除急症。"))
    } else emptyList()

fun composeInsight(
    subjectId: SubjectId,
    metrics: List<DerivedMetric>,
    deviations: List<Deviation>,
    symptoms: SymptomReport = SymptomReport(),
): Result<DomainError, Insight> {
    val qualified = metrics.filter { it.quality !is DataQuality.Rejected }
    if (qualified.isEmpty()) return Result.Err(DomainError("NO_QUALIFIED_METRICS"))
    val facts = qualified.map { Fact(it.id, it.metricId, it.value, it.unit, it.quality) }
    val degraded = qualified.any { it.quality is DataQuality.Degraded }
    val confidence = when {
        qualified.size >= 3 && !degraded && deviations.any { it.unusual } -> Confidence.HIGH
        qualified.any { it.quality.score >= 0.5 } -> Confidence.MEDIUM
        else -> Confidence.LOW
    }
    return Result.Ok(Insight(
        id = "insight:${facts.joinToString(":") { it.id }}", subjectId = subjectId,
        facts = facts,
        trends = deviations.map { Trend(it.metricId, it.direction, "${it.metricId.value} 相对个人基线${if (it.direction == "up") "升高" else if (it.direction == "down") "降低" else "稳定"}") },
        deviations = deviations,
        possibleExplanations = listOf(ExplanationHypothesis("睡眠、近期运动、压力、环境和测量条件都可能造成短期变化。")),
        actions = listOf(LowRiskAction("repeat_consistently", "在相似条件下持续观察，不依据单次读数下结论。", "7 days")),
        redFlags = deterministicRedFlags(symptoms),
        limitations = buildList { add(WELLNESS_DISCLAIMER); if (degraded) add("部分输入质量降级，结论仅供趋势参考。") },
        confidence = confidence,
    ))
}

data class PeriodSummary(
    val metricId: MetricId,
    val median: Double,
    val mean: Double,
    val minimum: Double,
    val maximum: Double,
    val unit: UnitCode,
    val sampleCount: Int,
)

data class HealthReport(
    val period: String,
    val summaries: List<PeriodSummary>,
    val insightIds: List<String>,
    val generatedBy: String = "deterministic-period-report/1.0.0",
    val correlationIsNotCausation: Boolean = true,
)

fun summarizePeriod(period: String, metrics: List<DerivedMetric>, insights: List<Insight>): Result<DomainError, HealthReport> {
    if (period !in setOf("daily", "weekly", "monthly")) return Result.Err(DomainError("INVALID_REPORT_PERIOD"))
    val summaries = metrics.filter { it.quality !is DataQuality.Rejected }.groupBy { it.metricId }.map { (id, items) ->
        val values = items.map { it.value }
        PeriodSummary(id, median(values), mean(values), values.min(), values.max(), items.first().unit, items.size)
    }.sortedBy { it.metricId.value }
    return Result.Ok(HealthReport(period, summaries, insights.map { it.id }))
}

data class NOfOneResult(
    val intervention: String,
    val beforeMedian: Double,
    val afterMedian: Double,
    val difference: Double,
    val causalClaimAllowed: Boolean = false,
    val limitation: String = "观察性自我实验只能形成相关性假设，不能自动证明因果。",
)

fun analyzeNOfOne(before: List<DerivedMetric>, after: List<DerivedMetric>, intervention: String): Result<DomainError, NOfOneResult> =
    if (before.size < 3 || after.size < 3) Result.Err(DomainError("INSUFFICIENT_N_OF_ONE_DATA"))
    else Result.Ok(NOfOneResult(intervention, median(before.map { it.value }), median(after.map { it.value }), median(after.map { it.value }) - median(before.map { it.value })))

data class ChangePoint(
    val metricId: MetricId,
    val at: InstantMs,
    val beforeMedian: Double,
    val afterMedian: Double,
    val robustEffect: Double?,
    val confidence: Confidence,
)

fun detectChangePoint(metrics: List<DerivedMetric>, minimumWindow: Int = 5): Result<DomainError, ChangePoint> {
    val ordered = metrics.filter { it.quality !is DataQuality.Rejected }.sortedBy { it.interval.start.value }
    if (ordered.size < minimumWindow * 2) return Result.Err(DomainError("INSUFFICIENT_CHANGE_POINT_HISTORY"))
    if (ordered.map { it.metricId }.distinct().size != 1) return Result.Err(DomainError("MIXED_CHANGE_POINT_SERIES"))
    val candidates = (minimumWindow..ordered.size - minimumWindow).map { split ->
        val before = ordered.take(split).takeLast(minimumWindow)
        val after = ordered.drop(split).take(minimumWindow)
        val left = median(before.map(DerivedMetric::value))
        val right = median(after.map(DerivedMetric::value))
        val dispersion = median((before + after).map { kotlin.math.abs(it.value - median((before + after).map(DerivedMetric::value))) })
        Triple(split, left to right, if (dispersion > 0) kotlin.math.abs(right - left) / (dispersion * 1.4826) else null)
    }
    val best = candidates.maxByOrNull { it.third ?: kotlin.math.abs(it.second.second - it.second.first) }
        ?: return Result.Err(DomainError("NO_CHANGE_POINT_CANDIDATE"))
    val confidence = when {
        (best.third ?: 0.0) >= 4.0 -> Confidence.HIGH
        (best.third ?: 0.0) >= 2.5 -> Confidence.MEDIUM
        else -> Confidence.LOW
    }
    return Result.Ok(ChangePoint(ordered.first().metricId, ordered[best.first].interval.start,
        best.second.first, best.second.second, best.third, confidence))
}
