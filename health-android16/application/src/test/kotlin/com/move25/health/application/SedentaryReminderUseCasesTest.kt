package com.move25.health.application

import com.move25.health.domain.Activation
import com.move25.health.domain.ConsentId
import com.move25.health.domain.DataQuality
import com.move25.health.domain.DomainError
import com.move25.health.domain.InstantMs
import com.move25.health.domain.Observation
import com.move25.health.domain.ObservationId
import com.move25.health.domain.ObservationKind
import com.move25.health.domain.ObservationValue
import com.move25.health.domain.Provenance
import com.move25.health.domain.Result
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentaryReminderState
import com.move25.health.domain.SedentarySuppressionReason
import com.move25.health.domain.SubjectId
import com.move25.health.domain.TimeInterval
import com.move25.health.domain.UnitCode
import com.move25.health.ports.AppendResult
import com.move25.health.ports.AuditEvent
import com.move25.health.ports.AuditPort
import com.move25.health.ports.ClockPort
import com.move25.health.ports.ConsentStorePort
import com.move25.health.ports.DataScope
import com.move25.health.ports.HealthNotification
import com.move25.health.ports.LocalMinuteOfDayPort
import com.move25.health.ports.NotificationPermissionPort
import com.move25.health.ports.NotificationPort
import com.move25.health.ports.SedentaryReminderSchedulePort
import com.move25.health.ports.SedentaryReminderSettingsPort
import com.move25.health.ports.SedentaryReminderStatePort
import com.move25.health.ports.TimelineQuery
import com.move25.health.ports.TimelineStorePort
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SedentaryReminderUseCasesTest {
    private val now = InstantMs(10_000_000L)
    private val subject = SubjectId("current")

    @Test
    fun `delivery is persisted audited and then cooled down`() = runTest {
        val timeline = FakeTimeline(listOf(sedentaryObservation(75.0)))
        val settings = FakeSettings(SedentaryReminderSettings(enabled = true, quietHours = null))
        val state = FakeState()
        val notifications = FakeNotifications()
        val audit = FakeAudit()
        val useCase = checkUseCase(timeline, settings, state, notifications, audit, consentGranted = true)

        val first = useCase(subject, Activation.Active(now)).ok()
        assertTrue(first is SedentaryReminderRun.Delivered)
        assertEquals(1, notifications.published.size)
        assertEquals(now, state.value.lastDeliveredAt)
        assertEquals(1, audit.events.size)

        val second = useCase(subject, Activation.Active(now)).ok()
        assertEquals(
            SedentarySuppressionReason.COOLDOWN,
            (second as SedentaryReminderRun.Suppressed).reason,
        )
        assertEquals(1, notifications.published.size)
    }

    @Test
    fun `missing consent avoids reading the health timeline`() = runTest {
        val timeline = FakeTimeline(listOf(sedentaryObservation(75.0)))
        val useCase = checkUseCase(
            timeline = timeline,
            settings = FakeSettings(SedentaryReminderSettings(enabled = true, quietHours = null)),
            state = FakeState(),
            notifications = FakeNotifications(),
            audit = FakeAudit(),
            consentGranted = false,
        )
        val result = useCase(subject, Activation.Active(now)).ok()
        assertEquals(
            SedentarySuppressionReason.CONSENT_REQUIRED,
            (result as SedentaryReminderRun.Suppressed).reason,
        )
        assertEquals(0, timeline.queryCount)
    }

    @Test
    fun `disabling reminder clears runtime state and cancels work`() = runTest {
        val settings = FakeSettings(SedentaryReminderSettings(enabled = true))
        val state = FakeState(
            SedentaryReminderState(
                lastDeliveredAt = now,
                lastDeliveredSedentaryMinutes = 75,
                snoozedUntil = InstantMs(now.value + 30 * 60_000L),
            ),
        )
        val schedule = FakeSchedule()
        val useCase = ConfigureSedentaryReminderUseCase(settings, state, schedule)

        useCase(SedentaryReminderSettings(enabled = false), monitoringActive = true).ok()
        assertEquals(false, settings.value.enabled)
        assertEquals(null, state.value.lastDeliveredAt)
        assertEquals(listOf(false), schedule.reconciled)
        assertEquals(0, schedule.immediateCount)
    }

    private fun checkUseCase(
        timeline: FakeTimeline,
        settings: FakeSettings,
        state: FakeState,
        notifications: FakeNotifications,
        audit: FakeAudit,
        consentGranted: Boolean,
    ) = CheckSedentaryReminderUseCase(
        timeline = timeline,
        consents = FakeConsents(consentGranted),
        settings = settings,
        state = state,
        notifications = notifications,
        notificationPermission = object : NotificationPermissionPort {
            override fun isGranted() = true
        },
        localTime = object : LocalMinuteOfDayPort {
            override fun minuteOfDay(at: InstantMs) = 12 * 60
        },
        clock = object : ClockPort {
            override fun now() = now
        },
        audit = audit,
    )

    private fun sedentaryObservation(minutes: Double): Observation = Observation(
        id = ObservationId("sedentary"),
        subjectId = subject,
        kind = ObservationKind.SEDENTARY_MINUTES,
        value = ObservationValue.Scalar(minutes),
        unit = UnitCode.MINUTE,
        interval = interval(now.value - 80 * 60_000L, now.value - 5 * 60_000L),
        provenance = Provenance(
            sourcePlatform = "test",
            sourceApp = "test",
            sourceDeviceModel = "test",
            sourceDeviceIdPseudonym = "test",
            firmwareVersion = null,
            apiName = "test",
            apiVersion = "1",
            originalDataType = "sedentary",
            samplingRateHz = null,
            sensorLocation = null,
            algorithmVendor = null,
            algorithmVersion = null,
            platformRecordId = "sedentary",
        ),
        quality = DataQuality.Good(0.9, emptyMap()),
        consentId = ConsentId("consent"),
        ingestedAt = now,
    )

    private fun interval(start: Long, end: Long): TimeInterval = when (val result = TimeInterval.of(start, end)) {
        is Result.Ok -> result.value
        is Result.Err -> error(result.error)
    }

    private fun <A> Result<DomainError, A>.ok(): A = when (this) {
        is Result.Ok -> value
        is Result.Err -> error("unexpected error: ${error.code}")
    }

    private class FakeTimeline(private val items: List<Observation>) : TimelineStorePort {
        var queryCount = 0
        override suspend fun append(batch: List<Observation>) = Result.Ok(AppendResult(batch.size, 0))
        override suspend fun query(query: TimelineQuery): Result<DomainError, List<Observation>> {
            queryCount += 1
            return Result.Ok(items)
        }
        override fun observe(query: TimelineQuery): Flow<List<Observation>> = MutableStateFlow(items)
        override suspend fun tombstone(subjectId: SubjectId, kinds: Set<ObservationKind>) = Result.Ok(0)
        override suspend fun deleteDerived(subjectId: SubjectId) = Result.Ok(Unit)
    }

    private class FakeConsents(private val granted: Boolean) : ConsentStorePort {
        override suspend fun grant(
            subjectId: SubjectId,
            purpose: String,
            scopes: Set<DataScope>,
            at: InstantMs,
        ) = Result.Ok(ConsentId("consent"))

        override suspend fun revoke(subjectId: SubjectId, purpose: String, at: InstantMs) = Result.Ok(Unit)
        override suspend fun activeConsent(subjectId: SubjectId, purpose: String): ConsentId? =
            if (granted) ConsentId("consent") else null
    }

    private class FakeSettings(initial: SedentaryReminderSettings) : SedentaryReminderSettingsPort {
        private val flow = MutableStateFlow(initial)
        val value get() = flow.value
        override fun observeSettings() = flow
        override suspend fun readSettings() = flow.value
        override suspend fun writeSettings(settings: SedentaryReminderSettings): Result<DomainError, Unit> {
            flow.value = settings
            return Result.Ok(Unit)
        }
    }

    private class FakeState(initial: SedentaryReminderState = SedentaryReminderState()) : SedentaryReminderStatePort {
        private val flow = MutableStateFlow(initial)
        val value get() = flow.value
        override fun observeState() = flow
        override suspend fun readState() = flow.value
        override suspend fun writeState(state: SedentaryReminderState): Result<DomainError, Unit> {
            flow.value = state
            return Result.Ok(Unit)
        }
    }

    private class FakeNotifications : NotificationPort {
        val published = mutableListOf<HealthNotification>()
        override suspend fun publish(notification: HealthNotification): Result<DomainError, Unit> {
            published += notification
            return Result.Ok(Unit)
        }
    }

    private class FakeAudit : AuditPort {
        val events = mutableListOf<AuditEvent>()
        override suspend fun append(event: AuditEvent): Result<DomainError, Unit> {
            events += event
            return Result.Ok(Unit)
        }
    }

    private class FakeSchedule : SedentaryReminderSchedulePort {
        val reconciled = mutableListOf<Boolean>()
        var immediateCount = 0
        override fun reconcile(enabled: Boolean): Result<DomainError, Unit> {
            reconciled += enabled
            return Result.Ok(Unit)
        }
        override fun enqueueImmediate(): Result<DomainError, Unit> {
            immediateCount += 1
            return Result.Ok(Unit)
        }
    }
}
