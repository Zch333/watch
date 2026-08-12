package com.move25.health.domain

sealed interface Activation {
    data class Dormant(val reason: String) : Activation
    data class Active(val enabledAt: InstantMs?) : Activation
}

data class ReleaseEvidence(
    val deviceCapabilityConfirmed: Boolean = false,
    val formalScopesApproved: Boolean = false,
    val dataQualityValidated: Boolean = false,
    val algorithmCardsComplete: Boolean = false,
    val privacyImpactComplete: Boolean = false,
    val aiSafetyPassed: Boolean = false,
    val deletionAndExportPassed: Boolean = false,
    val powerBudgetPassed: Boolean = false,
)

fun activationState(releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence): Activation {
    if (!releaseEnabled) return Activation.Dormant("RELEASE_GATE_DISABLED")
    if (!userEnabled) return Activation.Dormant("USER_SWITCH_OFF")
    val complete = evidence.deviceCapabilityConfirmed && evidence.formalScopesApproved && evidence.dataQualityValidated &&
        evidence.algorithmCardsComplete && evidence.privacyImpactComplete && evidence.aiSafetyPassed &&
        evidence.deletionAndExportPassed && evidence.powerBudgetPassed
    return if (!complete) Activation.Dormant("RELEASE_EVIDENCE_INCOMPLETE") else Activation.Active(null)
}

data class ResearchEvidence(
    val separateConsent: Boolean = false,
    val ethicsReviewed: Boolean = false,
    val deidentified: Boolean = false,
    val datasetCardComplete: Boolean = false,
    val isolatedEnvironment: Boolean = false,
)

fun researchAllowed(releaseEnabled: Boolean, evidence: ResearchEvidence): Boolean =
    releaseEnabled && evidence.separateConsent && evidence.ethicsReviewed && evidence.deidentified &&
        evidence.datasetCardComplete && evidence.isolatedEnvironment
