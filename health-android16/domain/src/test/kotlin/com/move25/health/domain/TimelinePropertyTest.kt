package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TimelinePropertyTest {
    @Test fun `dedupe is idempotent and keeps newest platform version`() {
        val old = observation("old", "platform-1", 10)
        val newest = observation("new", "platform-1", 20)
        val once = deduplicateTimeline(listOf(old, newest))
        assertEquals(listOf(newest), once)
        assertEquals(once, deduplicateTimeline(once))
    }

    @Test fun `window selects overlaps and rejects invalid semantics`() {
        val item = observation("one", "platform-1", 10)
        assertEquals(listOf(item), window(listOf(item), TimeInterval.of(50, 150).getOrNull()!!))
        assertTrue(validateObservation(item.copy(value = ObservationValue.Scalar(300.0))) is Result.Err)
    }

    private fun observation(id: String, platformId: String, ingested: Long) = Observation(
        ObservationId(id), SubjectId("subject"), ObservationKind.HEART_RATE, ObservationValue.Scalar(70.0), UnitCode.BPM,
        TimeInterval.of(100, 100).getOrNull()!!,
        Provenance("huawei", "Huawei Health", "GT 6", "device", "1", "Health Service", "1", "heart_rate",
            0.2, "wrist", null, null, platformId), DataQuality.Good(1.0, emptyMap()), ConsentId("consent"), InstantMs(ingested),
    )
}
