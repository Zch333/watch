package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class FeatureRegistryTest {
    @Test fun `feature ids are unique and high-risk capabilities remain gated`() {
        assertEquals(featureRegistry.size, featureRegistry.map(FeatureDefinition::id).toSet().size)
        val dormant = FeatureContext(false, emptyMap(), false, false)
        assertTrue(featureRegistry.all { featureAvailability(it, dormant) is Capability.Unsupported })
        val active = FeatureContext(true, emptyMap(), false, false)
        assertTrue(featureAvailability(featureRegistry.first { it.id == "arrhythmia" }, active) is Capability.RequiresApproval)
        assertTrue(featureAvailability(featureRegistry.first { it.id == "prv_research" }, active) is Capability.RequiresApproval)
        assertTrue(featureAvailability(featureRegistry.first { it.id == "ai_explanation" }, active) is Capability.RequiresPermission)
    }
}
