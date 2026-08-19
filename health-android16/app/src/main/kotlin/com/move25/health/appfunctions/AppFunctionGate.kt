package com.move25.health.appfunctions

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.appfunctions.AppFunctionManager
import com.move25.health.domain.*

object AppFunctionGate {
    suspend fun reconcile(context: Context, activation: Activation, userEnabled: Boolean): Result<DomainError, Unit> {
        if (Build.VERSION.SDK_INT < 36) return Result.Err(DomainError("APP_FUNCTIONS_REQUIRE_ANDROID_16"))
        return setEnabled(context, activation is Activation.Active && userEnabled)
    }

    @RequiresApi(36)
    private suspend fun setEnabled(context: Context, enabled: Boolean): Result<DomainError, Unit> = runCatching {
        val manager = AppFunctionManager.getInstance(context)
            ?: return Result.Err(DomainError("APP_FUNCTIONS_UNSUPPORTED_ON_DEVICE"))
        manager.setAppFunctionEnabled(
            BaseHealthAppFunctionServiceIds.GET_VERIFIED_WELLNESS_SUMMARY_ID,
            if (enabled) AppFunctionManager.APP_FUNCTION_STATE_ENABLED else AppFunctionManager.APP_FUNCTION_STATE_DISABLED,
        )
        Result.Ok(Unit)
    }.getOrElse { Result.Err(DomainError("APP_FUNCTION_GATE_FAILED", it.message)) }
}
