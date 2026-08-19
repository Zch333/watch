package com.move25.health.ui

import com.move25.health.domain.Activation
import com.move25.health.domain.QuietHours
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentaryReminderState

data class SedentaryReminderUiModel(
    val settings: SedentaryReminderSettings = SedentaryReminderSettings(),
    val reminderState: SedentaryReminderState = SedentaryReminderState(),
    val activation: Activation = Activation.Dormant("APPLICATION_STARTING"),
    val notificationPermissionGranted: Boolean = false,
    val busy: Boolean = false,
    val requestNotificationPermission: Boolean = false,
    val message: String? = null,
)

sealed interface SedentaryReminderUiAction {
    data class SetEnabled(val enabled: Boolean) : SedentaryReminderUiAction
    data class SetThreshold(val minutes: Int) : SedentaryReminderUiAction
    data class SetQuietHoursEnabled(val enabled: Boolean) : SedentaryReminderUiAction
    data object CheckNow : SedentaryReminderUiAction
    data object SnoozeThirtyMinutes : SedentaryReminderUiAction
    data object RequestNotificationPermission : SedentaryReminderUiAction
    data object NotificationPermissionRequestConsumed : SedentaryReminderUiAction
    data class NotificationPermissionResult(val granted: Boolean) : SedentaryReminderUiAction
    data object DismissMessage : SedentaryReminderUiAction
}

fun updateSedentaryReminderUi(
    model: SedentaryReminderUiModel,
    action: SedentaryReminderUiAction,
): SedentaryReminderUiModel = when (action) {
    is SedentaryReminderUiAction.SetEnabled -> model.copy(
        settings = model.settings.copy(enabled = action.enabled),
        busy = true,
        message = null,
    )
    is SedentaryReminderUiAction.SetThreshold -> model.copy(
        settings = model.settings.copy(thresholdMinutes = action.minutes.coerceIn(30, 180)),
        busy = true,
        message = null,
    )
    is SedentaryReminderUiAction.SetQuietHoursEnabled -> model.copy(
        settings = model.settings.copy(quietHours = if (action.enabled) QuietHours.Overnight else null),
        busy = true,
        message = null,
    )
    SedentaryReminderUiAction.CheckNow,
    SedentaryReminderUiAction.SnoozeThirtyMinutes -> model.copy(busy = true, message = null)
    SedentaryReminderUiAction.RequestNotificationPermission -> model.copy(
        requestNotificationPermission = true,
        message = null,
    )
    SedentaryReminderUiAction.NotificationPermissionRequestConsumed -> model.copy(
        requestNotificationPermission = false,
    )
    is SedentaryReminderUiAction.NotificationPermissionResult -> model.copy(
        notificationPermissionGranted = action.granted,
        busy = false,
        message = if (action.granted) {
            "通知权限已授予。"
        } else {
            "通知权限未授予，到期时不会发布提醒。"
        },
    )
    SedentaryReminderUiAction.DismissMessage -> model.copy(message = null)
}
