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
    val licenseAndSbomApproved: Boolean = false,
    val storeClaimsReviewed: Boolean = false,
)

fun missingReleaseEvidence(evidence: ReleaseEvidence): Set<String> = buildSet {
    if (!evidence.deviceCapabilityConfirmed) add("DEVICE_CAPABILITY")
    if (!evidence.formalScopesApproved) add("FORMAL_SCOPES")
    if (!evidence.dataQualityValidated) add("DATA_QUALITY")
    if (!evidence.algorithmCardsComplete) add("ALGORITHM_CARDS")
    if (!evidence.privacyImpactComplete) add("PRIVACY_IMPACT")
    if (!evidence.aiSafetyPassed) add("AI_SAFETY")
    if (!evidence.deletionAndExportPassed) add("DELETION_EXPORT")
    if (!evidence.powerBudgetPassed) add("POWER_BUDGET")
    if (!evidence.licenseAndSbomApproved) add("LICENSE_SBOM")
    if (!evidence.storeClaimsReviewed) add("STORE_CLAIMS")
}

fun activationState(releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence): Activation {
    if (!releaseEnabled) return Activation.Dormant("RELEASE_GATE_DISABLED")
    if (!userEnabled) return Activation.Dormant("USER_SWITCH_OFF")
    return if (missingReleaseEvidence(evidence).isNotEmpty()) {
        Activation.Dormant("RELEASE_EVIDENCE_INCOMPLETE")
    } else {
        Activation.Active(null)
    }
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
