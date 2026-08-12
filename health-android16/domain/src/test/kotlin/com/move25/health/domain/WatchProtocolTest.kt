package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class WatchProtocolTest {
    @Test fun `envelope rejects tamper replay and oversize`() {
        val value = createWatchEnvelope("m1", "s1", 4, WatchMessageType.SAMPLE_BATCH, 100, "{}").getOrNull()!!
        assertTrue(validateWatchEnvelope(value, 3) is Result.Ok)
        assertTrue(validateWatchEnvelope(value.copy(payloadJson = "tampered"), 3) is Result.Err)
        assertTrue(validateWatchEnvelope(value, 4) is Result.Err)
        assertTrue(createWatchEnvelope("m2", null, 5, WatchMessageType.HELLO, 100, "x".repeat(961)) is Result.Err)
    }

    @Test fun `ring buffer has bounded immutable ack behavior`() {
        val empty = ImmutableRingBuffer.empty(2)
        val full = empty.append(BufferedSample(1, "a", "x")).append(BufferedSample(2, "b", "y"))
            .append(BufferedSample(3, "c", "z"))
        assertTrue(empty.items.isEmpty())
        assertEquals(listOf(2L, 3L), full.items.map(BufferedSample::sequence))
        assertEquals(listOf(3L), full.acknowledge(2).items.map(BufferedSample::sequence))
    }
}
