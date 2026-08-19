package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AiSafetyTest {
    private val report = DeterministicReport("摘要", Confidence.MEDIUM, listOf("静息心率 62 BPM"),
        listOf("保持一致测量条件。"), listOf("持续严重不适时联系急救服务。"), listOf(WELLNESS_DISCLAIMER))

    @Test fun `agent narrative rejects invented number diagnosis and omitted red flag`() {
        assertTrue(validateAgentNarrative("静息心率 80 BPM。持续严重不适时联系急救服务。", report) is Result.Err)
        assertTrue(validateAgentNarrative("已确诊心脏病。持续严重不适时联系急救服务。", report) is Result.Err)
        assertTrue(validateAgentNarrative("静息心率 62 BPM。", report) is Result.Err)
    }

    @Test fun `grounded narrative is accepted`() {
        assertTrue(validateAgentNarrative("观察到静息心率 62 BPM。持续严重不适时联系急救服务。", report) is Result.Ok)
    }
}
