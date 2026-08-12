package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.RawPlatformRecord
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class NormalizerTest {
    @Test fun `normalizer rejects unknown types and preserves route provenance`() {
        assertTrue(HuaweiRecordNormalizer.normalize(record("NOT_REAL", "1", "COUNT"), ConsentId("c"), InstantMs(10)) is Result.Err)
        val route = HuaweiRecordNormalizer.normalize(record("GPS_ROUTE",
            """[{"epochMs":1,"latitude":1.0,"longitude":2.0}]""", "KILOMETER"), ConsentId("c"), InstantMs(10)).getOrNull()!!
        assertTrue(route.value is ObservationValue.Route)
        assertEquals("record", route.provenance.platformRecordId)
        assertEquals("huawei", route.provenance.sourcePlatform)
    }

    private fun record(kind: String, value: String, unit: String) = RawPlatformRecord("record", SubjectId("s"), kind, value,
        unit, 1, 2, "GT6", "device", "firmware", "HealthService", "1", 5)
}
