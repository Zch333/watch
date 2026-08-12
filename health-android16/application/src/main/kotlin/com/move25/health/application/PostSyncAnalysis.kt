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

        val recovery = computeRecoveryIndex(outputs, interval).getOrNull()
        if (recovery != null) metrics.append(listOf(recovery))
        val current = (outputs + listOfNotNull(recovery)).distinctBy(DerivedMetric::id)
        val history = when (val result = metrics.query(subjectId, emptySet(), null)) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        var baselineCount = 0
        val deviations = mutableListOf<Deviation>()
        history.groupBy(DerivedMetric::metricId).forEach { (_, series) ->
            val baseline = buildBaseline(series).getOrNull() ?: return@forEach
            if (metrics.saveBaseline(baseline) is Result.Ok) baselineCount++
            current.lastOrNull { it.metricId == baseline.metricId }?.let { latest ->
                compareToBaseline(baseline, latest).getOrNull()?.let(deviations::add)
            }
        }
        val insight = composeInsight(subjectId, current, deviations).getOrNull()
        val insightStored = insight != null && metrics.saveInsight(insight) is Result.Ok
        return Result.Ok(AnalysisSummary(current.size, baselineCount, insightStored, skipped))
    }
}
