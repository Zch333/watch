package com.move25.health.application

import com.move25.health.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class WorkflowTest {
    private val evidence = ReleaseEvidence(true, true, true, true, true, true, true, true)

    @Test fun `dormant state refuses every collection effect`() {
        val interval = TimeInterval.of(0, 1).getOrNull()!!
        val state = HealthState(false, true, releaseEvidence = evidence)
        assertTrue(decide(state, HealthCommand.Sync(SubjectId("s"), "activity", interval)) is Result.Err)
        assertTrue(decide(state, HealthCommand.StartWatchSession("d", sensorRequest())) is Result.Err)
        assertTrue(decide(state, HealthCommand.RequestAiExplanation(SubjectId("s"), "i")) is Result.Err)
    }

    @Test fun `sync requires both capability and group consent`() {
        val interval = TimeInterval.of(0, 1).getOrNull()!!
        val active = HealthState(true, true, releaseEvidence = evidence,
            capabilities = mapOf("activity" to Capability.Available()))
        assertTrue(decide(active, HealthCommand.Sync(SubjectId("s"), "activity", interval)) is Result.Err)
        val consented = active.copy(consents = mapOf("health:activity" to ConsentId("c")))
        assertTrue(decide(consented, HealthCommand.Sync(SubjectId("s"), "activity", interval)) is Result.Ok)
    }

    @Test fun `agent route is deterministic for red flags or missing consent`() {
        val available = Capability.Available()
        assertEquals(AgentRoute.DETERMINISTIC_ONLY, chooseAgentRoute(AgentPolicyInput(true, true, true, available, available, true)))
        assertEquals(AgentRoute.DETERMINISTIC_ONLY, chooseAgentRoute(AgentPolicyInput(true, false, true, available, available, false)))
        assertEquals(AgentRoute.ON_DEVICE, chooseAgentRoute(AgentPolicyInput(true, true, true, available, available, false)))
        assertEquals(AgentRoute.CLOUD, chooseAgentRoute(AgentPolicyInput(true, true, true, Capability.Unsupported("no"), available, false)))
    }

    private fun sensorRequest() = SensorSessionRequest("session", "heart_rate", SensorMode.BRIEF, 30, 1.0,
        ConsentId("consent"), PowerBudget(60, 2.0, 20, false))
}
