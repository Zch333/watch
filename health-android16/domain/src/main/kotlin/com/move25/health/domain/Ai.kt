package com.move25.health.domain

data class AiFact(val id: String, val metricId: String, val value: Double, val unit: String, val quality: String)
data class AiEnvelope(
    val schemaVersion: Int = 1,
    val purpose: String = "wellness_explanation",
    val locale: String,
    val insightId: String,
    val facts: List<AiFact>,
    val trends: List<Trend>,
    val deviations: List<Deviation>,
    val inputConfidence: Confidence,
    val limitations: List<String>,
    val redFlags: List<RedFlag>,
    val allowedActions: List<LowRiskAction>,
    val goals: List<String>,
)

fun buildAiEnvelope(insight: Insight, aiConsent: Boolean, locale: String, goals: List<String>): Result<DomainError, AiEnvelope> {
    if (!aiConsent) return Result.Err(DomainError("AI_CONSENT_REQUIRED"))
    return Result.Ok(AiEnvelope(
        locale = locale,
        insightId = insight.id,
        facts = insight.facts.mapIndexed { index, fact -> AiFact("fact-${index + 1}", fact.metricId.value, fact.value, fact.unit.name, fact.quality::class.simpleName ?: "Unknown") },
        trends = insight.trends,
        deviations = insight.deviations,
        inputConfidence = insight.confidence,
        limitations = insight.limitations,
        redFlags = insight.redFlags,
        allowedActions = insight.actions,
        goals = goals,
    ))
}

data class AiObservation(val statement: String, val factIds: List<String>, val confidence: Confidence)
data class AiTrend(val statement: String, val metricIds: List<String>, val direction: String)
data class AiAction(val action: String, val rationale: String, val evaluationWindow: String)
data class AiRedFlag(val message: String, val sourceRuleId: String)
data class UntrustedAiOutput(
    val summaryTitle: String,
    val overallConfidence: Confidence,
    val observations: List<AiObservation>,
    val trends: List<AiTrend>,
    val possibleNonmedicalExplanations: List<String>,
    val actions: List<AiAction>,
    val redFlags: List<AiRedFlag>,
    val limitations: List<String>,
    val clinicianDiscussionPoints: List<String>,
    val needsClarification: List<String>,
)

private val prohibitedClaims = setOf("确诊", "诊断为", "治愈", "停止用药", "增加剂量", "减少剂量", "definitive diagnosis", "stop medication", "change dose")

fun validateAiOutput(output: UntrustedAiOutput, envelope: AiEnvelope): Result<DomainError, UntrustedAiOutput> {
    val serialized = output.toString().lowercase()
    prohibitedClaims.firstOrNull { serialized.contains(it.lowercase()) }?.let { return Result.Err(DomainError("AI_MEDICAL_CLAIM_REJECTED", it)) }
    if (Regex("(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})", RegexOption.IGNORE_CASE).containsMatchIn(serialized)) {
        return Result.Err(DomainError("AI_IDENTITY_DATA_REJECTED"))
    }
    if (output.overallConfidence.ordinal > envelope.inputConfidence.ordinal) return Result.Err(DomainError("AI_CONFIDENCE_EXCEEDS_INPUT"))
    val facts = envelope.facts.associateBy { it.id }
    val metricIds = envelope.facts.map { it.metricId }.toSet()
    output.observations.forEach { observation ->
        if (observation.factIds.any { it !in facts }) return Result.Err(DomainError("AI_UNKNOWN_FACT_REFERENCE"))
        val allowedNumbers = observation.factIds.mapNotNull { facts[it]?.value }
        Regex("-?\\d+(?:\\.\\d+)?").findAll(observation.statement).map { it.value.toDouble() }.forEach { number ->
            if (allowedNumbers.none { kotlin.math.abs(it - number) < 0.0001 || kotlin.math.abs(kotlin.math.round(it) - number) < 0.0001 }) {
                return Result.Err(DomainError("AI_NUMERIC_FACT_CONFLICT", number.toString()))
            }
        }
    }
    output.trends.forEach { if (it.metricIds.any { id -> id !in metricIds }) return Result.Err(DomainError("AI_UNKNOWN_METRIC_REFERENCE")) }
    val allowedActions = envelope.allowedActions.map { it.text }.toSet()
    if (output.actions.any { it.action !in allowedActions }) return Result.Err(DomainError("AI_ACTION_NOT_ALLOWED"))
    val suppliedFlags = output.redFlags.map { it.sourceRuleId }.toSet()
    if (envelope.redFlags.any { it.id !in suppliedFlags }) return Result.Err(DomainError("AI_RED_FLAG_OMITTED"))
    return Result.Ok(output)
}

data class DeterministicReport(
    val title: String,
    val confidence: Confidence,
    val observations: List<String>,
    val actions: List<String>,
    val redFlags: List<String>,
    val limitations: List<String>,
    val generatedBy: String = "deterministic-template/1.0.0",
)

fun deterministicReport(insight: Insight) = DeterministicReport(
    "健康趋势摘要", insight.confidence,
    insight.facts.map { "${it.metricId.value}：${it.value} ${it.unit}" },
    insight.actions.map { it.text }, insight.redFlags.map { it.message }, insight.limitations,
)

fun validateAgentNarrative(text: String, report: DeterministicReport): Result<DomainError, String> {
    if (text.isBlank()) return Result.Err(DomainError("AGENT_EMPTY_OUTPUT"))
    val lowered = text.lowercase()
    prohibitedClaims.firstOrNull { lowered.contains(it.lowercase()) }?.let {
        return Result.Err(DomainError("AGENT_MEDICAL_CLAIM_REJECTED", it))
    }
    val allowedNumbers = report.observations.flatMap { statement ->
        Regex("-?\\d+(?:\\.\\d+)?").findAll(statement).map { it.value.toDouble() }.toList()
    }
    Regex("-?\\d+(?:\\.\\d+)?").findAll(text).map { it.value.toDouble() }.forEach { number ->
        if (number !in listOf(7.0, 24.0, 30.0) && allowedNumbers.none { kotlin.math.abs(it - number) < 0.0001 || kotlin.math.abs(kotlin.math.round(it) - number) < 0.0001 }) {
            return Result.Err(DomainError("AGENT_NUMERIC_FACT_CONFLICT", number.toString()))
        }
    }
    if (report.redFlags.isNotEmpty() && report.redFlags.none(text::contains)) return Result.Err(DomainError("AGENT_RED_FLAG_OMITTED"))
    return Result.Ok(text)
}
