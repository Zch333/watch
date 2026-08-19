package com.move25.health.adapter.android

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import com.move25.health.domain.DomainError
import com.move25.health.domain.InstantMs
import com.move25.health.domain.QuietHours
import com.move25.health.domain.Result
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentaryReminderState
import com.move25.health.ports.SedentaryReminderSettingsPort
import com.move25.health.ports.SedentaryReminderStatePort
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sedentaryReminderPreferences by preferencesDataStore("move25_sedentary_reminder")

class AndroidSedentaryReminderStore(context: Context) :
    SedentaryReminderSettingsPort,
    SedentaryReminderStatePort {
    private val store = context.applicationContext.sedentaryReminderPreferences

    override fun observeSettings(): Flow<SedentaryReminderSettings> = store.data
        .map { preferences ->
            val quietHoursEnabled = preferences[QUIET_HOURS_ENABLED] ?: true
            SedentaryReminderSettings(
                enabled = preferences[ENABLED] ?: false,
                thresholdMinutes = (preferences[THRESHOLD_MINUTES] ?: 60).coerceIn(30, 180),
                minimumBreakMinutes = (preferences[MINIMUM_BREAK_MINUTES] ?: 5).coerceIn(1, 30),
                cooldownMinutes = (preferences[COOLDOWN_MINUTES] ?: 120).coerceIn(15, 360),
                dataFreshnessMinutes = (preferences[DATA_FRESHNESS_MINUTES] ?: 30).coerceIn(5, 120),
                quietHours = if (quietHoursEnabled) {
                    QuietHours(
                        startMinuteOfDay = (preferences[QUIET_START_MINUTE] ?: 22 * 60).coerceIn(0, 1_439),
                        endMinuteOfDay = (preferences[QUIET_END_MINUTE] ?: 7 * 60).coerceIn(0, 1_439),
                    )
                } else {
                    null
                },
            )
        }

    override suspend fun readSettings(): SedentaryReminderSettings = observeSettings().first()

    override suspend fun writeSettings(settings: SedentaryReminderSettings): Result<DomainError, Unit> =
        runCatching {
            store.edit { preferences ->
                preferences[ENABLED] = settings.enabled
                preferences[THRESHOLD_MINUTES] = settings.thresholdMinutes
                preferences[MINIMUM_BREAK_MINUTES] = settings.minimumBreakMinutes
                preferences[COOLDOWN_MINUTES] = settings.cooldownMinutes
                preferences[DATA_FRESHNESS_MINUTES] = settings.dataFreshnessMinutes
                preferences[QUIET_HOURS_ENABLED] = settings.quietHours != null
                settings.quietHours?.let { quiet ->
                    preferences[QUIET_START_MINUTE] = quiet.startMinuteOfDay
                    preferences[QUIET_END_MINUTE] = quiet.endMinuteOfDay
                }
            }
            Result.Ok(Unit)
        }.getOrElse { failure ->
            if (failure is CancellationException) throw failure
            Result.Err(DomainError("SEDENTARY_SETTINGS_SAVE_FAILED"))
        }

    override fun observeState(): Flow<SedentaryReminderState> = store.data
        .map { preferences ->
            SedentaryReminderState(
                lastDeliveredAt = preferences[LAST_DELIVERED_AT]?.let(::InstantMs),
                lastDeliveredSedentaryMinutes = preferences[LAST_DELIVERED_MINUTES],
                snoozedUntil = preferences[SNOOZED_UNTIL]?.let(::InstantMs),
                revision = preferences[STATE_REVISION] ?: 0L,
            )
        }

    override suspend fun readState(): SedentaryReminderState = observeState().first()

    override suspend fun writeState(state: SedentaryReminderState): Result<DomainError, Unit> =
        runCatching {
            store.edit { preferences ->
                state.lastDeliveredAt?.let { preferences[LAST_DELIVERED_AT] = it.value }
                    ?: preferences.remove(LAST_DELIVERED_AT)
                state.lastDeliveredSedentaryMinutes?.let { preferences[LAST_DELIVERED_MINUTES] = it }
                    ?: preferences.remove(LAST_DELIVERED_MINUTES)
                state.snoozedUntil?.let { preferences[SNOOZED_UNTIL] = it.value }
                    ?: preferences.remove(SNOOZED_UNTIL)
                preferences[STATE_REVISION] = state.revision
            }
            Result.Ok(Unit)
        }.getOrElse { failure ->
            if (failure is CancellationException) throw failure
            Result.Err(DomainError("SEDENTARY_STATE_SAVE_FAILED"))
        }

    private companion object {
        val ENABLED = booleanPreferencesKey("enabled")
        val THRESHOLD_MINUTES = intPreferencesKey("threshold_minutes")
        val MINIMUM_BREAK_MINUTES = intPreferencesKey("minimum_break_minutes")
        val COOLDOWN_MINUTES = intPreferencesKey("cooldown_minutes")
        val DATA_FRESHNESS_MINUTES = intPreferencesKey("data_freshness_minutes")
        val QUIET_HOURS_ENABLED = booleanPreferencesKey("quiet_hours_enabled")
        val QUIET_START_MINUTE = intPreferencesKey("quiet_start_minute")
        val QUIET_END_MINUTE = intPreferencesKey("quiet_end_minute")
        val LAST_DELIVERED_AT = longPreferencesKey("last_delivered_at")
        val LAST_DELIVERED_MINUTES = intPreferencesKey("last_delivered_minutes")
        val SNOOZED_UNTIL = longPreferencesKey("snoozed_until")
        val STATE_REVISION = longPreferencesKey("state_revision")
    }
}
