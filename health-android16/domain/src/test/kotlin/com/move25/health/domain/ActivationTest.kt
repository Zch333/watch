package com.move25.health.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ActivationTest {
    private val complete = ReleaseEvidence(true, true, true, true, true, true, true, true, true, true)

    @Test fun `release switch dominates every other input`() {
        assertEquals(Activation.Dormant("RELEASE_GATE_DISABLED"), activationState(false, true, complete))
    }

    @Test fun `user switch and every evidence item are mandatory`() {
        assertEquals(Activation.Dormant("USER_SWITCH_OFF"), activationState(true, false, complete))
        complete.toBooleanList().indices.forEach { missing ->
            assertEquals(Activation.Dormant("RELEASE_EVIDENCE_INCOMPLETE"), activationState(true, true, complete.withMissing(missing)))
        }
        assertTrue(activationState(true, true, complete) is Activation.Active)
    }

    private fun ReleaseEvidence.toBooleanList() = listOf(deviceCapabilityConfirmed, formalScopesApproved,
        dataQualityValidated, algorithmCardsComplete, privacyImpactComplete, aiSafetyPassed,
        deletionAndExportPassed, powerBudgetPassed, licenseAndSbomApproved, storeClaimsReviewed)

    private fun ReleaseEvidence.withMissing(index: Int): ReleaseEvidence {
        val values = toBooleanList().toMutableList().apply { this[index] = false }
        return ReleaseEvidence(values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9])
    }
}
