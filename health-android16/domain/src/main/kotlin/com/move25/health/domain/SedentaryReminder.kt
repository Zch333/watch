package com.move25.health.domain

import kotlin.math.roundToInt

private const val MINUTE_MS = 60_000L
private const val MINIMUM_QUALITY_SCORE = 0.4
private const val MINIMUM_CONTINUOUS_BOUT_COVERAGE = 0.8
private const val MAXIMUM_CONTINUOUS_BOUT_COVERAGE = 1.2

data class QuietHours(
    val startMinuteOfDay: Int,
    val endMinuteOfDay: Int,
) {
    init {
        require(startMinuteOfDay in 0..1_439)
        require(endMinuteOfDay in 0..1_439)
    }

    fun contains(minuteOfDay: Int): Boolean {
        require(minuteOfDay in 0..1_439)
        if (startMinuteOfDay == endMinuteOfDay) return false
        return if (startMinuteOfDay < endMinuteOfDay) {
            minuteOfDay in startMinuteOfDay until endMinuteOfDay
        } else {
            minuteOfDay >= startMinuteOfDay || minuteOfDay < endMinuteOfDay
        }
    }

    companion object {
        val Overnight = QuietHours(startMinuteOfDay = 22 * 60, endMinuteOfDay = 7 * 60)
    }
}

data class SedentaryReminderSettings(
    val enabled: Boolean = false,
    val thresholdMinutes: Int = 60,
    val minimumBreakMinutes: Int = 5,
    val cooldownMinutes: Int = 120,
    val dataFreshnessMinutes: Int = 30,
    val quietHours: QuietHours? = QuietHours.Overnight,
) {
    init {
        require(thresholdMinutes in 30..180)
        require(minimumBreakMinutes in 1..30)
        require(cooldownMinutes in 15..360)
        require(dataFreshnessMinutes in 5..120)
    }
}

data class SedentaryReminderState(
    val lastDeliveredAt: InstantMs? = null,
    val lastDeliveredSedentaryMinutes: Int? = null,
    val snoozedUntil: InstantMs? = null,
    val revision: Long = 0,
)

data class SedentaryEvidence(
    val sedentaryMinutes: Int,
    val observedAt: InstantMs,
    val activeMinutesAfter: Int,
    val qualityScore: Double,
)

data class SedentaryCheckInput(
    val activation: Activation,
    val activityConsentGranted: Boolean,
    val notificationPermissionGranted: Boolean,
    val now: InstantMs,
    val localMinuteOfDay: Int,
    val evidence: SedentaryEvidence?,
)

enum class SedentarySuppressionReason {
    FEATURE_DISABLED,
    MONITORING_DORMANT,
    CONSENT_REQUIRED,
    QUIET_HOURS,
    SNOOZED,
    COOLDOWN,
    NO_QUALIFIED_DATA,
    STALE_DATA,
    RECENT_MOVEMENT,
    BELOW_THRESHOLD,
    NOTIFICATION_PERMISSION_REQUIRED,
}

sealed interface SedentaryReminderCommand {
    data class Check(val input: SedentaryCheckInput) : SedentaryReminderCommand
    data class Snooze(val now: InstantMs, val minutes: Int = 30) : SedentaryReminderCommand
    data class MarkDelivered(val at: InstantMs, val sedentaryMinutes: Int) : SedentaryReminderCommand
    data object Reset : SedentaryReminderCommand
}

sealed interface SedentaryReminderEvent {
    data class ReminderSuppressed(val reason: SedentarySuppressionReason) : SedentaryReminderEvent
    data class ReminderDue(val sedentaryMinutes: Int, val observedAt: InstantMs) : SedentaryReminderEvent
    data class ReminderSnoozed(val until: InstantMs) : SedentaryReminderEvent
    data class ReminderDelivered(val at: InstantMs, val sedentaryMinutes: Int) : SedentaryReminderEvent
    data object ReminderStateReset : SedentaryReminderEvent
}

sealed interface SedentaryReminderEffect {
    data class PublishReminder(
        val sedentaryMinutes: Int,
        val minimumBreakMinutes: Int,
    ) : SedentaryReminderEffect
}

data class SedentaryReminderDecision(
    val next: SedentaryReminderState,
    val events: List<SedentaryReminderEvent>,
    val effects: List<SedentaryReminderEffect>,
)

fun decideSedentaryReminder(
    state: SedentaryReminderState,
    settings: SedentaryReminderSettings,
    command: SedentaryReminderCommand,
): Result<DomainError, SedentaryReminderDecision> = when (command) {
    is SedentaryReminderCommand.Check -> checkSedentaryReminder(state, settings, command.input)
    is SedentaryReminderCommand.Snooze -> {
        if (!settings.enabled) {
            Result.Err(DomainError("SEDENTARY_REMINDER_DISABLED"))
        } else if (command.minutes !in 5..240) {
            Result.Err(DomainError("SEDENTARY_SNOOZE_OUT_OF_RANGE"))
        } else {
            val event = SedentaryReminderEvent.ReminderSnoozed(
                InstantMs(command.now.value + command.minutes * MINUTE_MS),
            )
            Result.Ok(SedentaryReminderDecision(evolveSedentaryReminder(state, event), listOf(event), emptyList()))
        }
    }
    is SedentaryReminderCommand.MarkDelivered -> {
        if (command.at.value < 0 || command.sedentaryMinutes <= 0) {
            Result.Err(DomainError("SEDENTARY_MINUTES_INVALID"))
        } else {
            val event = SedentaryReminderEvent.ReminderDelivered(command.at, command.sedentaryMinutes)
            Result.Ok(SedentaryReminderDecision(evolveSedentaryReminder(state, event), listOf(event), emptyList()))
        }
    }
    SedentaryReminderCommand.Reset -> {
        val event = SedentaryReminderEvent.ReminderStateReset
        Result.Ok(SedentaryReminderDecision(evolveSedentaryReminder(state, event), listOf(event), emptyList()))
    }
}

private fun checkSedentaryReminder(
    state: SedentaryReminderState,
    settings: SedentaryReminderSettings,
    input: SedentaryCheckInput,
): Result<DomainError, SedentaryReminderDecision> {
    if (input.localMinuteOfDay !in 0..1_439) {
        return Result.Err(DomainError("LOCAL_MINUTE_OF_DAY_INVALID"))
    }

    val suppression = when {
        !settings.enabled -> SedentarySuppressionReason.FEATURE_DISABLED
        input.activation !is Activation.Active -> SedentarySuppressionReason.MONITORING_DORMANT
        !input.activityConsentGranted -> SedentarySuppressionReason.CONSENT_REQUIRED
        settings.quietHours?.contains(input.localMinuteOfDay) == true -> SedentarySuppressionReason.QUIET_HOURS
        state.snoozedUntil?.value?.let { it > input.now.value } == true -> SedentarySuppressionReason.SNOOZED
        state.lastDeliveredAt?.let { input.now.value - it.value < settings.cooldownMinutes * MINUTE_MS } == true ->
            SedentarySuppressionReason.COOLDOWN
        input.evidence == null -> SedentarySuppressionReason.NO_QUALIFIED_DATA
        input.now.value < input.evidence.observedAt.value ||
            input.now.value - input.evidence.observedAt.value > settings.dataFreshnessMinutes * MINUTE_MS ->
            SedentarySuppressionReason.STALE_DATA
        !input.evidence.qualityScore.isFinite() || input.evidence.qualityScore < MINIMUM_QUALITY_SCORE ||
            input.evidence.sedentaryMinutes <= 0 || input.evidence.activeMinutesAfter < 0 ->
            SedentarySuppressionReason.NO_QUALIFIED_DATA
        input.evidence.activeMinutesAfter >= settings.minimumBreakMinutes -> SedentarySuppressionReason.RECENT_MOVEMENT
        input.evidence.sedentaryMinutes < settings.thresholdMinutes -> SedentarySuppressionReason.BELOW_THRESHOLD
        !input.notificationPermissionGranted -> SedentarySuppressionReason.NOTIFICATION_PERMISSION_REQUIRED
        else -> null
    }

    if (suppression != null) {
        val event = SedentaryReminderEvent.ReminderSuppressed(suppression)
        return Result.Ok(SedentaryReminderDecision(state, listOf(event), emptyList()))
    }

    val evidence = requireNotNull(input.evidence)
    val event = SedentaryReminderEvent.ReminderDue(evidence.sedentaryMinutes, evidence.observedAt)
    val effect = SedentaryReminderEffect.PublishReminder(
        sedentaryMinutes = evidence.sedentaryMinutes,
        minimumBreakMinutes = settings.minimumBreakMinutes,
    )
    return Result.Ok(SedentaryReminderDecision(state, listOf(event), listOf(effect)))
}

fun evolveSedentaryReminder(
    state: SedentaryReminderState,
    event: SedentaryReminderEvent,
): SedentaryReminderState = when (event) {
    is SedentaryReminderEvent.ReminderSuppressed,
    is SedentaryReminderEvent.ReminderDue -> state
    is SedentaryReminderEvent.ReminderSnoozed -> state.copy(
        snoozedUntil = event.until,
        revision = state.revision + 1,
    )
    is SedentaryReminderEvent.ReminderDelivered -> state.copy(
        lastDeliveredAt = event.at,
        lastDeliveredSedentaryMinutes = event.sedentaryMinutes,
        snoozedUntil = null,
        revision = state.revision + 1,
    )
    SedentaryReminderEvent.ReminderStateReset -> SedentaryReminderState(revision = state.revision + 1)
}

fun deriveSedentaryEvidence(
    observations: List<Observation>,
    now: InstantMs,
): SedentaryEvidence? {
    val sedentary = observations.asSequence()
        .filter { it.kind == ObservationKind.SEDENTARY_MINUTES }
        .filter { it.unit == UnitCode.MINUTE }
        .filter { it.interval.endExclusive.value <= now.value }
        .filter { it.quality !is DataQuality.Rejected && it.quality.score >= MINIMUM_QUALITY_SCORE }
        .mapNotNull { observation ->
            val value = (observation.value as? ObservationValue.Scalar)?.number
            val durationMinutes = (
                observation.interval.endExclusive.value - observation.interval.start.value
            ).toDouble() / MINUTE_MS
            val coverage = if (durationMinutes > 0.0 && value != null) value / durationMinutes else Double.NaN
            if (
                value == null ||
                !value.isFinite() ||
                value <= 0.0 ||
                !coverage.isFinite() ||
                coverage !in MINIMUM_CONTINUOUS_BOUT_COVERAGE..MAXIMUM_CONTINUOUS_BOUT_COVERAGE
            ) {
                null
            } else {
                observation to value
            }
        }
        .maxByOrNull { it.first.interval.endExclusive.value }
        ?: return null

    val observedAt = sedentary.first.interval.endExclusive
    val activeMinutesAfter = observations.asSequence()
        .filter { it.kind == ObservationKind.ACTIVE_MINUTES }
        .filter { it.unit == UnitCode.MINUTE }
        .filter { it.interval.start.value >= observedAt.value && it.interval.endExclusive.value <= now.value }
        .filter { it.quality !is DataQuality.Rejected && it.quality.score >= MINIMUM_QUALITY_SCORE }
        .mapNotNull { observation ->
            val value = (observation.value as? ObservationValue.Scalar)?.number
            val durationMinutes = (
                observation.interval.endExclusive.value - observation.interval.start.value
            ).toDouble() / MINUTE_MS
            if (
                value == null ||
                !value.isFinite() ||
                value <= 0.0 ||
                durationMinutes <= 0.0 ||
                value > durationMinutes * MAXIMUM_CONTINUOUS_BOUT_COVERAGE
            ) {
                null
            } else {
                value
            }
        }
        .sum()
        .roundToInt()

    return SedentaryEvidence(
        sedentaryMinutes = sedentary.second.roundToInt(),
        observedAt = observedAt,
        activeMinutesAfter = activeMinutesAfter,
        qualityScore = sedentary.first.quality.score,
    )
}
