package com.move25.health.ports

import com.move25.health.domain.DomainError
import com.move25.health.domain.InstantMs
import com.move25.health.domain.Result
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentaryReminderState
import kotlinx.coroutines.flow.Flow

interface SedentaryReminderSettingsPort {
    fun observeSettings(): Flow<SedentaryReminderSettings>
    suspend fun readSettings(): SedentaryReminderSettings
    suspend fun writeSettings(settings: SedentaryReminderSettings): Result<DomainError, Unit>
}

interface SedentaryReminderStatePort {
    fun observeState(): Flow<SedentaryReminderState>
    suspend fun readState(): SedentaryReminderState
    suspend fun writeState(state: SedentaryReminderState): Result<DomainError, Unit>
}

interface LocalMinuteOfDayPort {
    fun minuteOfDay(at: InstantMs): Int
}

interface NotificationPermissionPort {
    fun isGranted(): Boolean
}

interface SedentaryReminderSchedulePort {
    fun reconcile(enabled: Boolean): Result<DomainError, Unit>
    fun enqueueImmediate(): Result<DomainError, Unit>
}
