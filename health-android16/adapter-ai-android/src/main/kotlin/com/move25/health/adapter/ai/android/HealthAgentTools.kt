package com.move25.health.adapter.ai.android

import com.google.adk.kt.annotations.Param
import com.google.adk.kt.annotations.Tool
import com.move25.health.domain.DeterministicReport

/** Tool input is a precomputed report, never raw samples or user identity. */
class HealthAgentTools(private val report: DeterministicReport) {
    @Tool(
        name = "get_verified_health_summary",
        description = "Returns the deterministic wellness summary, confidence, limitations and red flags. It contains no diagnosis and no raw sensor samples.",
    )
    fun getVerifiedHealthSummary(
        @Param("Requested section: observations, actions, red_flags, limitations, or all.") section: String,
    ): Map<String, Any> = when (section.lowercase()) {
        "observations" -> mapOf("confidence" to report.confidence.name, "observations" to report.observations)
        "actions" -> mapOf("actions" to report.actions)
        "red_flags" -> mapOf("red_flags" to report.redFlags)
        "limitations" -> mapOf("limitations" to report.limitations)
        else -> mapOf(
            "title" to report.title,
            "confidence" to report.confidence.name,
            "observations" to report.observations,
            "actions" to report.actions,
            "red_flags" to report.redFlags,
            "limitations" to report.limitations,
        )
    }
}
