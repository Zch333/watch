package com.move25.health.appfunctions

import androidx.annotation.RequiresApi
import androidx.appfunctions.*

@AppFunctionSerializable(isDescribedByKDoc = true)
data class AppFunctionMetric(
    /** Internal metric identifier. */ val metricId: String,
    /** Median already computed and validated by the deterministic engine. */ val median: Double,
    /** Unit code. */ val unit: String,
    /** Number of qualified derived records. */ val sampleCount: Int,
)

@AppFunctionSerializable(isDescribedByKDoc = true)
data class AppFunctionHealthSummary(
    /** Report period. */ val period: String,
    /** Qualified aggregate metrics; never contains raw samples. */ val metrics: List<AppFunctionMetric>,
    /** Mandatory wellness-only limitation. */ val limitation: String,
)

/** Android 16 system-agent boundary. It is compiled and indexed but every function ships disabled. */
@RequiresApi(36)
@AppFunctionServiceEntryPoint(serviceName = "HealthAppFunctionService", appFunctionXmlFileName = "health_app_function_service")
abstract class BaseHealthAppFunctionService : AppFunctionService() {
    /**
     * Returns a deterministic wellness summary for one to thirty days.
     * It never returns identity, raw sensor samples, diagnoses, medication advice or emergency decisions.
     */
    @AppFunction(isEnabled = false, isDescribedByKDoc = true)
    suspend fun getVerifiedWellnessSummary(days: Int): AppFunctionHealthSummary = when (val result = AppFunctionBridge.summary(days)) {
        is com.move25.health.domain.Result.Ok -> result.value
        is com.move25.health.domain.Result.Err -> when (result.error.code) {
            "APP_FUNCTION_DAYS_OUT_OF_RANGE" -> throw AppFunctionInvalidArgumentException("days must be between 1 and 30")
            else -> throw AppFunctionAppUnknownException(result.error.code)
        }
    }
}
