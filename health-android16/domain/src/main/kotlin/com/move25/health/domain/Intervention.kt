package com.move25.health.domain

data class InterventionPlan(
    val id: String,
    val subjectId: SubjectId,
    val title: String,
    val action: String,
    val targetMetric: MetricId,
    val baselineWindowDays: Int,
    val interventionWindowDays: Int,
    val washoutDays: Int,
    val startedAt: InstantMs,
    val safetyStopText: String,
    val status: InterventionStatus = InterventionStatus.PLANNED,
)

enum class InterventionStatus { PLANNED, ACTIVE, COMPLETED, CANCELLED }

fun validateIntervention(plan: InterventionPlan): Result<DomainError, InterventionPlan> = when {
    plan.title.isBlank() || plan.action.isBlank() -> Result.Err(DomainError("INTERVENTION_TEXT_REQUIRED"))
    plan.baselineWindowDays !in 3..90 -> Result.Err(DomainError("INVALID_BASELINE_WINDOW"))
    plan.interventionWindowDays !in 3..90 -> Result.Err(DomainError("INVALID_INTERVENTION_WINDOW"))
    plan.washoutDays !in 0..30 -> Result.Err(DomainError("INVALID_WASHOUT_WINDOW"))
    plan.safetyStopText.isBlank() -> Result.Err(DomainError("SAFETY_STOP_REQUIRED"))
    else -> Result.Ok(plan)
}

fun transitionIntervention(plan: InterventionPlan, target: InterventionStatus): Result<DomainError, InterventionPlan> {
    val allowed = when (plan.status) {
        InterventionStatus.PLANNED -> target in setOf(InterventionStatus.ACTIVE, InterventionStatus.CANCELLED)
        InterventionStatus.ACTIVE -> target in setOf(InterventionStatus.COMPLETED, InterventionStatus.CANCELLED)
        InterventionStatus.COMPLETED, InterventionStatus.CANCELLED -> false
    }
    return if (allowed) Result.Ok(plan.copy(status = target)) else Result.Err(DomainError("INVALID_INTERVENTION_TRANSITION"))
}
