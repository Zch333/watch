package com.move25.health.adapter.android

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.move25.health.domain.*
import com.move25.health.ports.*
import java.util.UUID

class SystemClockAdapter : ClockPort { override fun now() = InstantMs(System.currentTimeMillis()) }
class UuidAdapter : IdPort { override fun next(prefix: String) = "$prefix:${UUID.randomUUID()}" }

class AndroidNotificationAdapter(private val context: Context) : NotificationPort {
    override suspend fun publish(notification: HealthNotification): Result<DomainError, Unit> {
        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return Result.Err(DomainError("NOTIFICATION_PERMISSION_REQUIRED"))
        }
        return runCatching {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "健康趋势提醒", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "仅显示低风险健康管理提醒，不用作医疗警报"
            })
            val item = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(notification.title).setContentText(notification.body).setAutoCancel(true)
                .setCategory(if (notification.redFlag) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER).build()
            NotificationManagerCompat.from(context).notify(notification.id.hashCode(), item)
            Result.Ok(Unit)
        }.getOrElse { Result.Err(DomainError("NOTIFICATION_PUBLISH_FAILED", it.message)) }
    }

    private companion object { const val CHANNEL = "move25.health.trends" }
}
