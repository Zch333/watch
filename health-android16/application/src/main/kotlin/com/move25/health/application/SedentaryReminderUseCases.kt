package com.move25.health.application

import com.move25.health.domain.Activation
import com.move25.health.domain.DomainError
import com.move25.health.domain.ObservationKind
import com.move25.health.domain.Result
import com.move25.health.domain.SedentaryCheckInput
import com.move25.health.domain.SedentaryReminderCommand
import com.move25.health.domain.SedentaryReminderEffect
import com.move25.health.domain.SedentaryReminderEvent
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentaryReminderState
import com.move25.health.domain.SedentarySuppressionReason
import com.move25.health.domain.SubjectId
import com.move25.health.domain.TimeInterval
import com.move25.health.domain.decideSedentaryReminder
import com.move25.health.domain.deriveSedentaryEvidence
import com.move25.health.ports.AuditEvent
import com.move25.health.ports.AuditPort
import com.move25.health.ports.ClockPort
import com.move25.health.ports.ConsentStorePort
import com.move25.health.ports.HealthNotification
import com.move25.health.ports.LocalMinuteOfDayPort
import com.move25.health.ports.NotificationPermissionPort
import com.move25.health.ports.NotificationPort
import com.move25.health.ports.SedentaryReminderSchedulePort
import com.move25.health.ports.SedentaryReminderSettingsPort
import com.move25.health.ports.SedentaryReminderStatePort
import com.move25.health.ports.TimelineQuery
import com.move25.health.ports.TimelineStorePort

private const val ACTIVITY_CONSENT_PURPOSE = "health:activity"
private const val REMINDER_LOOKBACK_MS = 24L * 60L * 60L * 1_000L

sealed interface SedentaryReminderRun {
    data class Suppressed(val reason: SedentarySuppressionReason) : SedentaryReminderRun
    data class Delivered(val sedentaryMinutes: Int, val atEpochMs: Long) : SedentaryReminderRun
}

class CheckSedentaryReminderUseCase(
    private val timeline: TimelineStorePort,
    private val consents: ConsentStorePort,
    private val settings: SedentaryReminderSettingsPort,
    private val state: SedentaryReminderStatePort,
    private val notifications: NotificationPort,
    private val notificationPermission: NotificationPermissionPort,
    private val localTime: LocalMinuteOfDayPort,
    private val clock: ClockPort,
    private val audit: AuditPort,
) {
    suspend operator fun invoke(
        subjectId: SubjectId,
        activation: Activation,
    ): Result<DomainError, SedentaryReminderRun> {
        val currentSettings = settings.readSettings()
        val currentState = state.readState()
        val now = clock.now()
        val minuteOfDay = localTime.minuteOfDay(now)

        if (!currentSettings.enabled || activation !is Activation.Active) {
            return evaluateWithoutEvidence(
                currentState = currentState,
                currentSettings = currentSettings,
                input = SedentaryCheckInput(
                    activation = activation,
                    activityConsentGranted = false,
                    notificationPermissionGranted = notificationPermission.isGranted(),
                    now = now,
                    localMinuteOfDay = minuteOfDay,
                    evidence = null,
                ),
            )
        }

        val consentGranted = consents.activeConsent(subjectId, ACTIVITY_CONSENT_PURPOSE) != null
        val preflightInput = SedentaryCheckInput(
            activation = activation,
            activityConsentGranted = consentGranted,
            notificationPermissionGranted = notificationPermission.isGranted(),
            now = now,
            localMinuteOfDay = minuteOfDay,
            evidence = null,
        )
        val preflight = when (val result = decideSedentaryReminder(
            currentState,
            currentSettings,
            SedentaryReminderCommand.Check(preflightInput),
        )) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val preflightReason = (preflight.events.singleOrNull() as? SedentaryReminderEvent.ReminderSuppressed)?.reason
        if (preflightReason != null && preflightReason != SedentarySuppressionReason.NO_QUALIFIED_DATA) {
            return Result.Ok(SedentaryReminderRun.Suppressed(preflightReason))
        }

        val interval = when (val result = TimeInterval.of(now.value - REMINDER_LOOKBACK_MS, now.value)) {
            is Result.Ok -> result.value
            is Result.Err -> return Result.Err(DomainError("SEDENTARY_LOOKBACK_INVALID", result.error))
        }
        val observations = when (val result = timeline.query(
            TimelineQuery(
                subjectId = subjectId,
                interval = interval,
                kinds = setOf(ObservationKind.SEDENTARY_MINUTES, ObservationKind.ACTIVE_MINUTES),
            ),
        )) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }

        val decision = when (val result = decideSedentaryReminder(
            currentState,
            currentSettings,
            SedentaryReminderCommand.Check(
                preflightInput.copy(evidence = deriveSedentaryEvidence(observations, now)),
            ),
        )) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val effect = decision.effects.singleOrNull()
        if (effect == null) {
            val reason = (decision.events.singleOrNull() as? SedentaryReminderEvent.ReminderSuppressed)?.reason
                ?: return Result.Err(DomainError("SEDENTARY_DECISION_WITHOUT_OUTCOME"))
            return Result.Ok(SedentaryReminderRun.Suppressed(reason))
        }

        val publish = effect as? SedentaryReminderEffect.PublishReminder
            ?: return Result.Err(DomainError("SEDENTARY_EFFECT_UNSUPPORTED"))
        when (val result = notifications.publish(
            HealthNotification(
                id = "sedentary-reminder",
                title = "该起身活动了",
                body = "检测到约 ${publish.sedentaryMinutes} 分钟低活动，请起身活动至少 ${publish.minimumBreakMinutes} 分钟。",
                redFlag = false,
            ),
        )) {
            is Result.Err -> return result
            is Result.Ok -> Unit
        }

        val delivered = when (val result = decideSedentaryReminder(
            currentState,
            currentSettings,
            SedentaryReminderCommand.MarkDelivered(now, publish.sedentaryMinutes),
        )) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        when (val result = state.writeState(delivered.next)) {
            is Result.Err -> return result
            is Result.Ok -> Unit
        }
        when (val result = audit.append(
            AuditEvent(
                type = "SedentaryReminderDelivered",
                at = now,
                subjectPseudonym = subjectId.value,
                metadata = mapOf(
                    "sedentaryMinutes" to publish.sedentaryMinutes.toString(),
                    "minimumBreakMinutes" to publish.minimumBreakMinutes.toString(),
                ),
            ),
        )) {
            is Result.Err -> return result
            is Result.Ok -> Unit
        }
        return Result.Ok(SedentaryReminderRun.Delivered(publish.sedentaryMinutes, now.value))
    }

    private fun evaluateWithoutEvidence(
        currentState: SedentaryReminderState,
        currentSettings: SedentaryReminderSettings,
        input: SedentaryCheckInput,
    ): Result<DomainError, SedentaryReminderRun> {
        return when (val result = decideSedentaryReminder(
            currentState,
            currentSettings,
            SedentaryReminderCommand.Check(input),
        )) {
            is Result.Err -> result
            is Result.Ok -> {
                val reason = (result.value.events.singleOrNull() as? SedentaryReminderEvent.ReminderSuppressed)?.reason
                    ?: return Result.Err(DomainError("SEDENTARY_PREFLIGHT_WITHOUT_SUPPRESSION"))
                Result.Ok(SedentaryReminderRun.Suppressed(reason))
            }
        }
    }
}

class ConfigureSedentaryReminderUseCase(
    private val settings: SedentaryReminderSettingsPort,
    private val state: SedentaryReminderStatePort,
    private val schedule: SedentaryReminderSchedulePort,
) {
    suspend operator fun invoke(
        newSettings: SedentaryReminderSettings,
        monitoringActive: Boolean,
    ): Result<DomainError, Unit> {
        when (val result = settings.writeSettings(newSettings)) {
            is Result.Err -> return result
            is Result.Ok -> Unit
        }
        if (!newSettings.enabled) {
            val reset = when (val result = decideSedentaryReminder(
                state.readState(),
                newSettings,
                SedentaryReminderCommand.Reset,
            )) {
                is Result.Ok -> result.value
                is Result.Err -> return result
            }
            when (val result = state.writeState(reset.next)) {
                is Result.Err -> return result
                is Result.Ok -> Unit
            }
        }
        when (val result = schedule.reconcile(monitoringActive && newSettings.enabled)) {
            is Result.Err -> return result
            is Result.Ok -> Unit
        }
        return if (monitoringActive && newSettings.enabled) {
            schedule.enqueueImmediate()
        } else {
            Result.Ok(Unit)
        }
    }
}

class SnoozeSedentaryReminderUseCase(
    private val settings: SedentaryReminderSettingsPort,
    private val state: SedentaryReminderStatePort,
    private val clock: ClockPort,
) {
    suspend operator fun invoke(minutes: Int = 30): Result<DomainError, Unit> {
        val decision = when (val result = decideSedentaryReminder(
            state.readState(),
            settings.readSettings(),
            SedentaryReminderCommand.Snooze(clock.now(), minutes),
        )) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        return state.writeState(decision.next)
    }
}
