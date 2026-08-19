package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MetricAndBaselineTest {
    @Test fun `stable hash ignores input order and derivation preserves lineage`() {
        val left = observation("a", 1, 60.0)
        val right = observation("b", 2, 80.0)
        assertEquals(stableInputHash(listOf(left, right)), stableInputHash(listOf(right, left)))
        val metric = computeMedian("heart_rate", ObservationKind.HEART_RATE, listOf(left, right), interval()).getOrNull()!!
        assertEquals(70.0, metric.value)
        assertEquals(setOf(left.id, right.id), metric.inputIds.toSet())
        assertTrue(metric.provenance.inputHash.isNotBlank())
    }

    @Test fun `robust baseline rejects short and mixed histories`() {
        val seven = (1..7).map { metric("m$it", "rhr", it.toDouble()) }
        assertEquals(4.0, buildBaseline(seven).getOrNull()!!.median)
        assertTrue(buildBaseline(seven.take(6)) is Result.Err)
        assertTrue(buildBaseline(seven + metric("mixed", "sleep", 8.0)) is Result.Err)
    }

    private fun interval() = TimeInterval.of(0, 10).getOrNull()!!
    private fun observation(id: String, at: Long, value: Double) = Observation(ObservationId(id), SubjectId("s"),
        ObservationKind.HEART_RATE, ObservationValue.Scalar(value), UnitCode.BPM, TimeInterval.of(at, at).getOrNull()!!,
        Provenance("huawei", "health", "GT6", "d", null, "api", "1", "heart", null, "wrist", null, null, id),
        DataQuality.Good(1.0, emptyMap()), ConsentId("c"), InstantMs(at))
    private fun metric(id: String, type: String, value: Double) = DerivedMetric(id, SubjectId("s"), MetricId(type), value,
        UnitCode.BPM, interval(), AlgorithmReference("median", "1", "p", "r"), listOf(ObservationId(id)),
        DataQuality.Good(1.0, emptyMap()), null, EvidenceGrade.E1_ENGINEERING, MetricProvenance(id, "1", "test"))
}
