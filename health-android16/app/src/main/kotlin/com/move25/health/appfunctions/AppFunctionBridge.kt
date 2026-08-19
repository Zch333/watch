package com.move25.health.appfunctions

import com.move25.health.domain.*
import com.move25.health.ports.MetricStorePort
import com.move25.health.ports.ConsentStorePort

object AppFunctionBridge {
    @Volatile private var metricStore: MetricStorePort? = null
    @Volatile private var consentStore: ConsentStorePort? = null
    @Volatile private var activation: () -> Activation = { Activation.Dormant("NOT_INSTALLED") }

    fun install(store: MetricStorePort, consents: ConsentStorePort, activationProvider: () -> Activation) {
        metricStore = store
        consentStore = consents
        activation = activationProvider
    }

    suspend fun summary(days: Int): Result<DomainError, AppFunctionHealthSummary> {
        if (activation() !is Activation.Active) return Result.Err(DomainError("HEALTH_MONITORING_DORMANT"))
        if (consentStore?.activeConsent(SubjectId("current"), "app_function_summary") == null) {
            return Result.Err(DomainError("APP_FUNCTION_CONSENT_REQUIRED"))
        }
        if (days !in 1..30) return Result.Err(DomainError("APP_FUNCTION_DAYS_OUT_OF_RANGE"))
        val store = metricStore ?: return Result.Err(DomainError("APP_FUNCTION_BRIDGE_NOT_INSTALLED"))
        val end = System.currentTimeMillis()
        val interval = TimeInterval.of(end - days * 86_400_000L, end).getOrNull()
            ?: return Result.Err(DomainError("APP_FUNCTION_INTERVAL_INVALID"))
        val metrics = when (val result = store.query(SubjectId("current"), emptySet(), interval)) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val report = summarizePeriod(if (days == 1) "daily" else if (days <= 7) "weekly" else "monthly", metrics, emptyList())
        return when (report) {
            is Result.Err -> report
            is Result.Ok -> Result.Ok(AppFunctionHealthSummary(
                report.value.period,
                report.value.summaries.map { AppFunctionMetric(it.metricId.value, it.median, it.unit.name, it.sampleCount) },
                WELLNESS_DISCLAIMER,
            ))
        }
    }
}
