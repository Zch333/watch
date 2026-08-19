package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.AlgorithmPort
import com.move25.health.ports.MetricStorePort
import com.move25.health.ports.TimelineStorePort

data class AnalysisSummary(
    val computedMetrics: Int,
    val baselinesUpdated: Int,
    val insightCreated: Boolean,
    val skippedAlgorithms: Map<String, String>,
)

/** Effectful shell around pure algorithm, baseline and insight functions. */
class AnalyzeSynchronizedDataUseCase(
    private val timeline: TimelineStorePort,
    private val metrics: MetricStorePort,
    private val algorithms: AlgorithmPort,
) {
    suspend operator fun invoke(subjectId: SubjectId, interval: TimeInterval): Result<DomainError, AnalysisSummary> {
        val observations = when (val result = timeline.query(TimelineQuery(subjectId, interval))) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val outputs = mutableListOf<DerivedMetric>()
        val skipped = linkedMapOf<String, String>()
        algorithms.definitions().filter { it.level !in setOf(ProductLevel.L3_RESEARCH, ProductLevel.L4_REGULATED) }
            .forEach { definition ->
                when (val computed = algorithms.execute(AlgorithmRequest(definition.id, observations, interval))) {
                    is Result.Ok -> outputs += computed.value
                    is Result.Err -> skipped[definition.id] = computed.error.code
                }
            }
        if (outputs.isNotEmpty()) when (val stored = metrics.append(outputs.distinctBy(DerivedMetric::id))) {
            is Result.Err -> return stored
            is Result.Ok -> Unit
        }

        val recovery = when (val computed = computeRecoveryIndex(outputs, interval)) {
            is Result.Ok -> when (val stored = metrics.append(listOf(computed.value))) {
                is Result.Err -> return stored
                is Result.Ok -> computed.value
            }
            is Result.Err -> {
                skipped["recovery"] = computed.error.code
                null
            }
        }
        val current = (outputs + listOfNotNull(recovery)).distinctBy(DerivedMetric::id)
        val history = when (val result = metrics.query(subjectId, emptySet(), null)) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        var baselineCount = 0
        val deviations = mutableListOf<Deviation>()
        history.groupBy(DerivedMetric::metricId).forEach { (metricId, series) ->
            val baseline = when (val built = buildBaseline(series)) {
                is Result.Ok -> built.value
                is Result.Err -> {
                    skipped["baseline:${metricId.value}"] = built.error.code
                    return@forEach
                }
            }
            when (val stored = metrics.saveBaseline(baseline)) {
                is Result.Err -> return stored
                is Result.Ok -> baselineCount++
            }
            current.lastOrNull { it.metricId == baseline.metricId }?.let { latest ->
                when (val compared = compareToBaseline(baseline, latest)) {
                    is Result.Ok -> deviations += compared.value
                    is Result.Err -> skipped["deviation:${metricId.value}"] = compared.error.code
                }
            }
        }
        val insight = when (val composed = composeInsight(subjectId, current, deviations)) {
            is Result.Ok -> composed.value
            is Result.Err -> {
                skipped["insight"] = composed.error.code
                null
            }
        }
        val insightStored = if (insight == null) false else when (val stored = metrics.saveInsight(insight)) {
            is Result.Err -> return stored
            is Result.Ok -> true
        }
        return Result.Ok(AnalysisSummary(current.size, baselineCount, insightStored, skipped))
    }
}
