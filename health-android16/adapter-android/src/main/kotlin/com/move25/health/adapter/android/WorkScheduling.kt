package com.move25.health.adapter.android

import android.content.Context
import androidx.work.*
import com.move25.health.domain.Activation
import com.move25.health.domain.DomainError
import com.move25.health.domain.ReleaseEvidence
import com.move25.health.domain.Result as DomainResult
import com.move25.health.domain.activationState
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

object HealthWorkScheduler {
    private const val PERIODIC_NAME = "move25.health.periodic.sync"
    private const val IMMEDIATE_NAME = "move25.health.immediate.sync"

    fun reconcile(context: Context, releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence): DomainResult<DomainError, Unit> = protect("HEALTH_SCHEDULE_RECONCILE_FAILED") {
        val work = WorkManager.getInstance(context)
        if (activationState(releaseEnabled, userEnabled, evidence) !is Activation.Active) {
            work.cancelUniqueWork(PERIODIC_NAME)
            work.cancelUniqueWork(IMMEDIATE_NAME)
            return@protect
        }
        val request = PeriodicWorkRequestBuilder<HealthSyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true).build())
            .addTag("move25-health").build()
        work.enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun enqueueImmediate(context: Context, releaseEnabled: Boolean, userEnabled: Boolean, evidence: ReleaseEvidence): DomainResult<DomainError, Unit> = protect("HEALTH_SCHEDULE_ENQUEUE_FAILED") {
        if (activationState(releaseEnabled, userEnabled, evidence) !is Activation.Active) return@protect
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_NAME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<HealthSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .addTag("move25-health").build(),
        )
    }

    private inline fun protect(code: String, operation: () -> Unit): DomainResult<DomainError, Unit> = try {
        operation()
        DomainResult.Ok(Unit)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Throwable) {
        DomainResult.Err(DomainError(code))
    }
}

/** The app installs a process-local runner; missing runner means safe no-op failure, never accidental collection. */
object HealthSyncRunnerRegistry { @Volatile var runner: (suspend () -> Boolean)? = null }

class HealthSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val runner = HealthSyncRunnerRegistry.runner ?: return Result.failure(workDataOf("reason" to "RUNNER_NOT_INSTALLED"))
        return try {
            if (runner()) Result.success() else Result.retry()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Throwable) {
            Result.failure(workDataOf("reason" to "SYNC_EXECUTION_FAILED"))
        }
    }
}
