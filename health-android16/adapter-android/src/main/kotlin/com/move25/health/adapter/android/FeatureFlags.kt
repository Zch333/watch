package com.move25.health.adapter.android

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import com.move25.health.domain.DomainError
import com.move25.health.domain.Result
import com.move25.health.ports.FeatureFlagPort
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.healthFlags by preferencesDataStore("move25_health_flags")

class AndroidFeatureFlags(
    context: Context,
    private val researchReleaseEnabled: Boolean,
) : FeatureFlagPort {
    private val store = context.applicationContext.healthFlags
    private val userKey = booleanPreferencesKey("user_enabled")
    private val aiKey = booleanPreferencesKey("ai_enabled")
    private val researchKey = booleanPreferencesKey("research_user_enabled")
    private val appFunctionsKey = booleanPreferencesKey("app_functions_enabled")

    override fun observeUserEnabled(): Flow<Boolean> = store.data.map { it[userKey] ?: false }
    override fun observeAiEnabled(): Flow<Boolean> = store.data.map { it[aiKey] ?: false }
    override fun observeResearchEnabled(): Flow<Boolean> = store.data.map { researchReleaseEnabled && (it[researchKey] ?: false) }
    override fun observeAppFunctionsEnabled(): Flow<Boolean> = store.data.map { it[appFunctionsKey] ?: false }
    override suspend fun setUserEnabled(enabled: Boolean): Result<DomainError, Unit> = update(userKey, enabled)
    override suspend fun setAiEnabled(enabled: Boolean): Result<DomainError, Unit> = update(aiKey, enabled)
    override suspend fun setAppFunctionsEnabled(enabled: Boolean): Result<DomainError, Unit> = update(appFunctionsKey, enabled)

    private suspend fun update(key: androidx.datastore.preferences.core.Preferences.Key<Boolean>, value: Boolean): Result<DomainError, Unit> =
        runCatching { store.edit { it[key] = value }; Result.Ok(Unit) }
            .getOrElse { Result.Err(DomainError("FEATURE_FLAG_SAVE_FAILED", it.message)) }
}
