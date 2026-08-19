package com.move25.health.adapter.android

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.move25.health.domain.DomainError
import com.move25.health.domain.Result as DomainResult
import com.move25.health.ports.SedentaryReminderSchedulePort
import java.util.concurrent.TimeUnit

object SedentaryReminderWorkScheduler {
    private const val PERIODIC_NAME = "move25.health.sedentary.periodic"
    private const val IMMEDIATE_NAME = "move25.health.sedentary.immediate"

    fun reconcile(context: Context, enabled: Boolean) {
        val work = WorkManager.getInstance(context)
        if (!enabled) {
            work.cancelUniqueWork(PERIODIC_NAME)
            work.cancelUniqueWork(IMMEDIATE_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<SedentaryReminderWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .addTag("move25-sedentary-reminder")
            .build()
        work.enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun enqueueImmediate(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_NAME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SedentaryReminderWorker>()
                .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
                .addTag("move25-sedentary-reminder")
                .build(),
        )
    }
}

class AndroidSedentaryReminderScheduleAdapter(context: Context) : SedentaryReminderSchedulePort {
    private val applicationContext = context.applicationContext

    override fun reconcile(enabled: Boolean): DomainResult<DomainError, Unit> = runCatching {
        SedentaryReminderWorkScheduler.reconcile(applicationContext, enabled)
        DomainResult.Ok(Unit)
    }.getOrElse { DomainResult.Err(DomainError("SEDENTARY_SCHEDULE_RECONCILE_FAILED", it.message)) }

    override fun enqueueImmediate(): DomainResult<DomainError, Unit> = runCatching {
        SedentaryReminderWorkScheduler.enqueueImmediate(applicationContext)
        DomainResult.Ok(Unit)
    }.getOrElse { DomainResult.Err(DomainError("SEDENTARY_SCHEDULE_ENQUEUE_FAILED", it.message)) }
}

object SedentaryReminderRunnerRegistry {
    @Volatile var runner: (suspend () -> Boolean)? = null
}

class SedentaryReminderWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): ListenableWorker.Result {
        val runner = SedentaryReminderRunnerRegistry.runner
            ?: return ListenableWorker.Result.failure(workDataOf("reason" to "SEDENTARY_RUNNER_NOT_INSTALLED"))
        return runCatching {
            if (runner()) ListenableWorker.Result.success() else ListenableWorker.Result.retry()
        }.getOrElse {
            ListenableWorker.Result.failure(workDataOf("reason" to (it.message ?: "SEDENTARY_CHECK_FAILED")))
        }
    }
}
