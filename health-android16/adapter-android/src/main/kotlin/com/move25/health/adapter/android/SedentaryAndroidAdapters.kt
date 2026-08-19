package com.move25.health.adapter.android

import android.content.Context
import com.move25.health.ports.LocalMinuteOfDayPort
import com.move25.health.ports.NotificationPermissionPort
import com.move25.health.ports.NotificationPort
import com.move25.health.ports.SedentaryReminderSchedulePort
import com.move25.health.ports.SedentaryReminderSettingsPort
import com.move25.health.ports.SedentaryReminderStatePort

data class SedentaryAndroidAdapters(
    val settings: SedentaryReminderSettingsPort,
    val state: SedentaryReminderStatePort,
    val notifications: NotificationPort,
    val notificationPermission: NotificationPermissionPort,
    val localTime: LocalMinuteOfDayPort,
    val schedule: SedentaryReminderSchedulePort,
)

object SedentaryAndroidAdapterFactory {
    fun create(context: Context): SedentaryAndroidAdapters {
        val store = AndroidSedentaryReminderStore(context)
        return SedentaryAndroidAdapters(
            settings = store,
            state = store,
            notifications = AndroidNotificationAdapter(context),
            notificationPermission = AndroidNotificationPermissionAdapter(context),
            localTime = SystemLocalMinuteOfDayAdapter(),
            schedule = AndroidSedentaryReminderScheduleAdapter(context),
        )
    }
}
