package com.move25.health.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SedentaryReminderTest {
    private val now = InstantMs(10_000_000L)
    private val enabled = SedentaryReminderSettings(enabled = true, quietHours = null)
    private val evidence = SedentaryEvidence(
        sedentaryMinutes = 75,
        observedAt = InstantMs(now.value - 5 * 60_000L),
        activeMinutesAfter = 0,
        qualityScore = 0.9,
    )

    @Test
    fun `due reminder emits effect without mutating delivery state`() {
        val decision = check(settings = enabled)
        assertTrue(decision.effects.single() is SedentaryReminderEffect.PublishReminder)
        assertEquals(SedentaryReminderState(), decision.next)
    }

    @Test
    fun `quiet hours cross midnight`() {
        assertTrue(QuietHours.Overnight.contains(23 * 60))
        assertTrue(QuietHours.Overnight.contains(6 * 60 + 59))
        assertTrue(!QuietHours.Overnight.contains(12 * 60))
        val decision = check(
            settings = enabled.copy(quietHours = QuietHours.Overnight),
            localMinute = 23 * 60,
        )
        assertEquals(SedentarySuppressionReason.QUIET_HOURS, decision.suppression())
    }

    @Test
    fun `permission is required only after qualified evidence reaches threshold`() {
        val below = check(
            settings = enabled,
            permissionGranted = false,
            evidence = evidence.copy(sedentaryMinutes = 20),
        )
        assertEquals(SedentarySuppressionReason.BELOW_THRESHOLD, below.suppression())

        val due = check(settings = enabled, permissionGranted = false)
        assertEquals(SedentarySuppressionReason.NOTIFICATION_PERMISSION_REQUIRED, due.suppression())
    }

    @Test
    fun `unqualified injected evidence never reaches notification effect`() {
        val lowQuality = check(settings = enabled, evidence = evidence.copy(qualityScore = 0.2))
        assertEquals(SedentarySuppressionReason.NO_QUALIFIED_DATA, lowQuality.suppression())
        assertTrue(decideSedentaryReminder(SedentaryReminderState(), enabled,
            SedentaryReminderCommand.MarkDelivered(now, 0)) is Result.Err)
    }

    @Test
    fun `movement cooldown and snooze independently suppress repeats`() {
        val moved = check(settings = enabled, evidence = evidence.copy(activeMinutesAfter = 5))
        assertEquals(SedentarySuppressionReason.RECENT_MOVEMENT, moved.suppression())

        val delivered = decideSedentaryReminder(
            SedentaryReminderState(),
            enabled,
            SedentaryReminderCommand.MarkDelivered(now, 75),
        ).ok()
        val cooldown = check(
            state = delivered.next,
            settings = enabled,
            at = InstantMs(now.value + 30 * 60_000L),
        )
        assertEquals(SedentarySuppressionReason.COOLDOWN, cooldown.suppression())

        val snoozed = decideSedentaryReminder(
            SedentaryReminderState(),
            enabled,
            SedentaryReminderCommand.Snooze(now, 30),
        ).ok()
        val snoozeCheck = check(state = snoozed.next, settings = enabled)
        assertEquals(SedentarySuppressionReason.SNOOZED, snoozeCheck.suppression())
    }

    @Test
    fun `evidence extractor ignores rejected data and records later movement`() {
        val extracted = deriveSedentaryEvidence(
            listOf(
                observation(
                    id = "rejected",
                    kind = ObservationKind.SEDENTARY_MINUTES,
                    value = 120.0,
                    start = now.value - 130 * 60_000L,
                    end = now.value - 10 * 60_000L,
                    quality = DataQuality.Rejected(
                        listOf(QualityIssue(QualityDimension.SEMANTIC_VALIDITY, "INVALID", "invalid")),
                    ),
                ),
                observation(
                    id = "qualified",
                    kind = ObservationKind.SEDENTARY_MINUTES,
                    value = 70.0,
                    start = now.value - 75 * 60_000L,
                    end = now.value - 5 * 60_000L,
                ),
                observation(
                    id = "movement",
                    kind = ObservationKind.ACTIVE_MINUTES,
                    value = 6.0,
                    start = now.value - 5 * 60_000L,
                    end = now.value + 60_000L,
                ),
            ),
            InstantMs(now.value + 60_000L),
        )
        assertEquals(70, extracted?.sedentaryMinutes)
        assertEquals(6, extracted?.activeMinutesAfter)
    }

    @Test
    fun `daily aggregate is not accepted as a continuous sedentary bout`() {
        val extracted = deriveSedentaryEvidence(
            listOf(
                observation(
                    id = "daily-aggregate",
                    kind = ObservationKind.SEDENTARY_MINUTES,
                    value = 60.0,
                    start = now.value - 8 * 60 * 60_000L,
                    end = now.value - 5 * 60_000L,
                ),
            ),
            now,
        )
        assertNull(extracted)
    }

    private fun check(
        state: SedentaryReminderState = SedentaryReminderState(),
        settings: SedentaryReminderSettings,
        at: InstantMs = now,
        localMinute: Int = 12 * 60,
        permissionGranted: Boolean = true,
        evidence: SedentaryEvidence? = this.evidence,
    ): SedentaryReminderDecision = decideSedentaryReminder(
        state,
        settings,
        SedentaryReminderCommand.Check(
            SedentaryCheckInput(
                activation = Activation.Active(at),
                activityConsentGranted = true,
                notificationPermissionGranted = permissionGranted,
                now = at,
                localMinuteOfDay = localMinute,
                evidence = evidence,
            ),
        ),
    ).ok()

    private fun SedentaryReminderDecision.suppression(): SedentarySuppressionReason =
        (events.single() as SedentaryReminderEvent.ReminderSuppressed).reason

    private fun <A> Result<DomainError, A>.ok(): A = when (this) {
        is Result.Ok -> value
        is Result.Err -> error("unexpected domain error: ${error.code}")
    }

    private fun observation(
        id: String,
        kind: ObservationKind,
        value: Double,
        start: Long,
        end: Long,
        quality: DataQuality = DataQuality.Good(0.9, emptyMap()),
    ): Observation = Observation(
        id = ObservationId(id),
        subjectId = SubjectId("current"),
        kind = kind,
        value = ObservationValue.Scalar(value),
        unit = UnitCode.MINUTE,
        interval = when (val result = TimeInterval.of(start, end)) {
            is Result.Ok -> result.value
            is Result.Err -> error(result.error)
        },
        provenance = Provenance(
            sourcePlatform = "test",
            sourceApp = "test",
            sourceDeviceModel = "test",
            sourceDeviceIdPseudonym = "test",
            firmwareVersion = null,
            apiName = "test",
            apiVersion = "1",
            originalDataType = kind.name,
            samplingRateHz = null,
            sensorLocation = null,
            algorithmVendor = null,
            algorithmVersion = null,
            platformRecordId = id,
        ),
        quality = quality,
        consentId = ConsentId("consent"),
        ingestedAt = InstantMs(end),
    )
}
