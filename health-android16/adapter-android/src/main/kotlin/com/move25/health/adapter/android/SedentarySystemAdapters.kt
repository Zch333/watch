package com.move25.health.adapter.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.move25.health.domain.InstantMs
import com.move25.health.ports.LocalMinuteOfDayPort
import com.move25.health.ports.NotificationPermissionPort
import java.time.Instant
import java.time.ZoneId

class AndroidNotificationPermissionAdapter(private val context: Context) : NotificationPermissionPort {
    override fun isGranted(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
}

class SystemLocalMinuteOfDayAdapter(
    private val zoneId: () -> ZoneId = { ZoneId.systemDefault() },
) : LocalMinuteOfDayPort {
    override fun minuteOfDay(at: InstantMs): Int {
        val localTime = Instant.ofEpochMilli(at.value).atZone(zoneId()).toLocalTime()
        return localTime.hour * 60 + localTime.minute
    }
}
