package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.*

class ComputeFeatureGroupUseCase(
    private val timeline: TimelineStorePort,
    private val metrics: MetricStorePort,
    private val algorithms: AlgorithmPort,
) {
    suspend operator fun invoke(subjectId: SubjectId, groupId: String, interval: TimeInterval): Result<DomainError, List<DerivedMetric>> {
        val inputs = when (val queried = timeline.query(TimelineQuery(subjectId, interval))) {
            is Result.Ok -> queried.value
            is Result.Err -> return queried
        }
        val accepted = when (val computed = algorithms.execute(AlgorithmRequest(groupId, inputs, interval))) {
            is Result.Ok -> computed.value
            is Result.Err -> return computed
        }
        return when (val stored = metrics.append(accepted)) {
            is Result.Ok -> Result.Ok(accepted)
            is Result.Err -> stored
        }
    }
}

class BuildBaselineUseCase(private val metrics: MetricStorePort) {
    suspend operator fun invoke(subjectId: SubjectId, metricId: MetricId): Result<DomainError, PersonalBaseline> {
        val history = when (val queried = metrics.query(subjectId, setOf(metricId), null)) {
            is Result.Ok -> queried.value
            is Result.Err -> return queried
        }
        return buildBaseline(history).flatMap { baseline -> metrics.saveBaseline(baseline).map { baseline } }
    }
}

class GenerateInsightUseCase(private val metrics: MetricStorePort) {
    suspend operator fun invoke(
        subjectId: SubjectId,
        metricIds: Set<MetricId>,
        interval: TimeInterval,
        baselines: Map<MetricId, PersonalBaseline>,
        symptoms: SymptomReport,
    ): Result<DomainError, Insight> {
        val values = when (val queried = metrics.query(subjectId, metricIds, interval)) {
            is Result.Ok -> queried.value
            is Result.Err -> return queried
        }
        val deviations = values.mapNotNull { metric -> baselines[metric.metricId]?.let { compareToBaseline(it, metric).getOrNull() } }
        return composeInsight(subjectId, values, deviations, symptoms).flatMap { insight -> metrics.saveInsight(insight).map { insight } }
    }
}

sealed interface ExplanationResult {
    data class VerifiedAi(val value: UntrustedAiOutput) : ExplanationResult
    data class DeterministicFallback(val value: DeterministicReport, val reason: DomainError) : ExplanationResult
}

class ExplainInsightUseCase(private val ai: AiInferencePort) {
    suspend operator fun invoke(insight: Insight, aiConsent: Boolean, locale: String, goals: List<String>): ExplanationResult {
        val envelope = when (val built = buildAiEnvelope(insight, aiConsent, locale, goals)) {
            is Result.Ok -> built.value
            is Result.Err -> return ExplanationResult.DeterministicFallback(deterministicReport(insight), built.error)
        }
        return when (val completed = ai.complete(envelope)) {
            is Result.Ok -> when (val verified = validateAiOutput(completed.value, envelope)) {
                is Result.Ok -> ExplanationResult.VerifiedAi(verified.value)
                is Result.Err -> ExplanationResult.DeterministicFallback(deterministicReport(insight), verified.error)
            }
            is Result.Err -> ExplanationResult.DeterministicFallback(deterministicReport(insight), completed.error)
        }
    }
}

class GenerateReportUseCase(private val metrics: MetricStorePort) {
    suspend operator fun invoke(subjectId: SubjectId, period: String, interval: TimeInterval, insights: List<Insight>): Result<DomainError, HealthReport> =
        when (val queried = metrics.query(subjectId, emptySet(), interval)) {
            is Result.Ok -> summarizePeriod(period, queried.value, insights)
            is Result.Err -> queried
        }
}
