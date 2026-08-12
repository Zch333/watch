package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class FeatureEngineeringTest {
    @Test fun `quality rejected observations never become metrics`() {
        val rejected = observation("bad", ObservationKind.HEART_RATE, 70.0,
            DataQuality.Rejected(listOf(QualityIssue(QualityDimension.SIGNAL_QUALITY, "MOTION", "motion"))))
        assertTrue(computeHeartRateMetrics(listOf(rejected), interval()).single() is Result.Err)
    }

    @Test fun `activity sleep and recovery are deterministic`() {
        val values = listOf(
            observation("steps", ObservationKind.STEP_COUNT, 2_000.0),
            observation("sleep", ObservationKind.SLEEP_DURATION, 420.0),
            observation("rest", ObservationKind.RESTING_HEART_RATE, 60.0),
            observation("stress", ObservationKind.STRESS_VENDOR, 20.0),
        )
        assertEquals(2_000.0, computeActivityMetrics(values, interval()).first().getOrNull()!!.value)
        val metrics = computeSleepMetrics(values, interval()).mapNotNull { it.getOrNull() } +
            computeHeartRateMetrics(values, interval()).mapNotNull { it.getOrNull() } +
            computeStressMetrics(values, interval()).mapNotNull { it.getOrNull() }
        assertTrue(computeRecoveryIndex(metrics, interval()).getOrNull()!!.value in 0.0..100.0)
    }

    private fun interval() = TimeInterval.of(0, 1_000).getOrNull()!!
    private fun observation(id: String, kind: ObservationKind, value: Double, quality: DataQuality = DataQuality.Good(1.0, emptyMap())) =
        Observation(ObservationId(id), SubjectId("s"), kind, ObservationValue.Scalar(value), when (kind) {
            ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE -> UnitCode.BPM
            ObservationKind.SLEEP_DURATION -> UnitCode.MINUTE
            ObservationKind.STEP_COUNT -> UnitCode.COUNT
            else -> UnitCode.SCORE
        }, interval(), Provenance("huawei", "health", "GT6", "d", null, "api", "1", kind.name, null, "wrist", null, null, id),
            quality, ConsentId("c"), InstantMs(100))
}
