package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class InsightAndInterventionTest {
    @Test fun `period report excludes rejected metrics and never claims causality`() {
        val accepted = metric("a", 10.0, DataQuality.Good(1.0, emptyMap()))
        val rejected = metric("b", 999.0, DataQuality.Rejected(listOf(
            QualityIssue(QualityDimension.SEMANTIC_VALIDITY, "BAD", "invalid"))))
        val report = summarizePeriod("weekly", listOf(accepted, rejected), emptyList()).getOrNull()!!
        assertEquals(10.0, report.summaries.single().median)
        assertTrue(report.correlationIsNotCausation)
    }

    @Test fun `n of one needs enough data and keeps causal claim disabled`() {
        val before = (1..3).map { metric("b$it", it.toDouble()) }
        val after = (4..6).map { metric("a$it", it.toDouble()) }
        assertTrue(analyzeNOfOne(before.take(2), after, "固定睡眠时间") is Result.Err)
        val result = analyzeNOfOne(before, after, "固定睡眠时间").getOrNull()!!
        assertFalse(result.causalClaimAllowed)
        assertEquals(3.0, result.difference)
    }

    @Test fun `intervention state machine only allows forward or cancel transitions`() {
        val plan = InterventionPlan("p", SubjectId("s"), "固定作息", "每天同一时间上床", MetricId("sleep_duration"),
            7, 7, 0, InstantMs(1), "出现不适时停止")
        val active = transitionIntervention(plan, InterventionStatus.ACTIVE).getOrNull()!!
        assertTrue(transitionIntervention(active, InterventionStatus.COMPLETED) is Result.Ok)
        assertTrue(transitionIntervention(plan, InterventionStatus.COMPLETED) is Result.Err)
    }

    private fun metric(id: String, value: Double, quality: DataQuality = DataQuality.Good(1.0, emptyMap())) = DerivedMetric(
        id, SubjectId("s"), MetricId("sleep_duration"), value, UnitCode.MINUTE,
        TimeInterval.of(0, 1).getOrNull()!!, AlgorithmReference("test", "1", "p", "r"), listOf(ObservationId(id)),
        quality, null, EvidenceGrade.E1_ENGINEERING, MetricProvenance(id, "1", "test"),
    )
}
