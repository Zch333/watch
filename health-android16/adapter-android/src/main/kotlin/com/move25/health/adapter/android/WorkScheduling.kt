package com.move25.health.adapter.android

import android.content.Context
import androidx.work.*
import com.move25.health.domain.Activation
import com.move25.health.domain.ReleaseEvidence
import com.move25.health.domain.activationState
import java.util.concurrent.TimeUnit

object HealthWorkScheduler {
    private const val PERIODIC_NAME = "move25.health.periodic.sync"
    private const val IMMEDIATE_NAME = "move25.health.immediate.sync"

    fun reconcile(context: Context, releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence) {
        val work = WorkManager.getInstance(context)
        if (activationState(releaseEnabled, userEnabled, evidence) !is Activation.Active) {
            work.cancelUniqueWork(PERIODIC_NAME)
            work.cancelUniqueWork(IMMEDIATE_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<HealthSyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true).build())
            .addTag("move25-health").build()
        work.enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun enqueueImmediate(context: Context, releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence) {
        if (activationState(releaseEnabled, userEnabled, evidence) !is Activation.Active) return
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_NAME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<HealthSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .addTag("move25-health").build(),
        )
    }
}

/** The app installs a process-local runner; missing runner means safe no-op failure, never accidental collection. */
object HealthSyncRunnerRegistry { @Volatile var runner: (suspend () -> Boolean)? = null }

class HealthSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val runner = HealthSyncRunnerRegistry.runner ?: return Result.failure(workDataOf("reason" to "RUNNER_NOT_INSTALLED"))
        return runCatching { if (runner()) Result.success() else Result.retry() }
            .getOrElse { Result.failure(workDataOf("reason" to (it.message ?: "SYNC_FAILED"))) }
    }
}
