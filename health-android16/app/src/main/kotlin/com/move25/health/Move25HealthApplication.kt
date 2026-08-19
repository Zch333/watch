package com.move25.health

import android.app.Application
import com.move25.health.adapter.ai.android.AdkNanoHealthAgent
import com.move25.health.adapter.ai.android.FirebaseAgentFactory
import com.move25.health.adapter.android.AndroidAdapterFactory
import com.move25.health.adapter.android.HealthSyncRunnerRegistry
import com.move25.health.adapter.android.HealthWorkScheduler
import com.move25.health.adapter.android.SedentaryAndroidAdapterFactory
import com.move25.health.adapter.android.SedentaryReminderRunnerRegistry
import com.move25.health.adapter.android.SystemClockAdapter
import com.move25.health.adapter.huawei.HuaweiHealthAdapter
import com.move25.health.adapter.huawei.HuaweiNativeClientProvider
import com.move25.health.adapter.huawei.HuaweiRealtimeHeartRateAdapter
import com.move25.health.adapter.huawei.HuaweiWearEngineAdapter
import com.move25.health.adapter.huawei.WearPeerIdentity
import com.move25.health.appfunctions.AppFunctionBridge
import com.move25.health.appfunctions.AppFunctionGate
import com.move25.health.application.AnalyzeSynchronizedDataUseCase
import com.move25.health.application.CheckSedentaryReminderUseCase
import com.move25.health.application.SyncHealthDataUseCase
import com.move25.health.domain.Activation
import com.move25.health.domain.ReleaseEvidence
import com.move25.health.domain.Result
import com.move25.health.domain.SubjectId
import com.move25.health.domain.TimeInterval
import com.move25.health.domain.activationState
import com.move25.health.domain.getOrNull
import com.move25.health.domain.huaweiDataPlan
import com.move25.health.ports.AuditEvent
import com.move25.health.ports.BuiltInAlgorithmAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class Move25HealthApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    @Volatile private var currentActivation: Activation = Activation.Dormant("APPLICATION_STARTING")

    val graph: HealthGraph by lazy {
        val android = AndroidAdapterFactory.create(this, BuildConfig.RESEARCH_RELEASE_ENABLED)
        val sedentary = SedentaryAndroidAdapterFactory.create(this)
        val native = HuaweiNativeClientProvider.current()
        val huawei = HuaweiHealthAdapter(native, cloud = null)
        val wear = runCatching {
            if (BuildConfig.HUAWEI_PEER_PACKAGE.isBlank() || BuildConfig.HUAWEI_PEER_CERT_SHA256.isBlank()) null
            else HuaweiWearEngineAdapter(
                native,
                WearPeerIdentity(BuildConfig.HUAWEI_PEER_PACKAGE, BuildConfig.HUAWEI_PEER_CERT_SHA256),
            )
        }.getOrNull()
        HealthGraph(
            releaseEnabled = BuildConfig.HEALTH_RELEASE_ENABLED,
            releaseEvidence = ReleaseEvidence(
                BuildConfig.EVIDENCE_DEVICE_CAPABILITY,
                BuildConfig.EVIDENCE_SCOPES_APPROVED,
                BuildConfig.EVIDENCE_DATA_QUALITY,
                BuildConfig.EVIDENCE_ALGORITHM_CARDS,
                BuildConfig.EVIDENCE_PRIVACY_IMPACT,
                BuildConfig.EVIDENCE_AI_SAFETY,
                BuildConfig.EVIDENCE_DELETION_EXPORT,
                BuildConfig.EVIDENCE_POWER_BUDGET,
            ),
            android = android,
            sedentary = sedentary,
            huawei = huawei,
            realtimeHeartRate = HuaweiRealtimeHeartRateAdapter(native),
            algorithms = BuiltInAlgorithmAdapter(),
            localAgent = AdkNanoHealthAgent(),
            cloudAgent = FirebaseAgentFactory.createIfConfigured(this) {
                BuildConfig.EVIDENCE_FIREBASE_APP_CHECK
            },
            cloudDeletion = null,
            watchSensors = wear,
            watchMessaging = wear,
        )
    }

    override fun onCreate() {
        super.onCreate()
        val activeGraph = graph
        HealthSyncRunnerRegistry.runner = { synchronizeInBackground(activeGraph) }
        SedentaryReminderRunnerRegistry.runner = { checkSedentaryInBackground(activeGraph) }
        AppFunctionBridge.install(
            activeGraph.android.metrics,
            activeGraph.android.consents,
        ) { currentActivation }

        applicationScope.launch {
            combine(
                activeGraph.android.flags.observeUserEnabled(),
                activeGraph.android.flags.observeAppFunctionsEnabled(),
                activeGraph.sedentary.settings.observeSettings(),
            ) { userEnabled, appFunctionsEnabled, reminderSettings ->
                Triple(userEnabled, appFunctionsEnabled, reminderSettings)
            }.collect { (userEnabled, appFunctionsEnabled, reminderSettings) ->
                currentActivation = activationState(
                    activeGraph.releaseEnabled,
                    userEnabled,
                    activeGraph.releaseEvidence,
                )
                AppFunctionGate.reconcile(
                    this@Move25HealthApplication,
                    currentActivation,
                    appFunctionsEnabled,
                )
                HealthWorkScheduler.reconcile(
                    this@Move25HealthApplication,
                    activeGraph.releaseEnabled,
                    userEnabled,
                    activeGraph.releaseEvidence,
                )
                when (val result = activeGraph.sedentary.schedule.reconcile(
                    currentActivation is Activation.Active && reminderSettings.enabled,
                )) {
                    is Result.Ok -> Unit
                    is Result.Err -> activeGraph.android.audit.append(
                        AuditEvent(
                            type = "SedentaryScheduleFailed",
                            at = SystemClockAdapter().now(),
                            subjectPseudonym = null,
                            metadata = mapOf("error" to result.error.code),
                        ),
                    )
                }
            }
        }
    }

    private suspend fun synchronizeInBackground(activeGraph: HealthGraph): Boolean {
        if (currentActivation !is Activation.Active) return false
        val clock = SystemClockAdapter()
        val end = clock.now().value
        val interval = TimeInterval.of(end - 30L * 86_400_000L, end).getOrNull() ?: return false
        val sync = SyncHealthDataUseCase(
            activeGraph.huawei,
            activeGraph.android.timeline,
            activeGraph.android.consents,
            activeGraph.android.cursors,
            clock,
            activeGraph.android.audit,
            activeGraph.android.quarantine,
        )
        val subject = SubjectId("current")
        var attempted = false
        huaweiDataPlan.forEach { group ->
            if (activeGraph.android.consents.activeConsent(subject, "health:${group.id}") != null) {
                attempted = true
                sync(subject, group, interval)
            }
        }
        if (attempted) {
            AnalyzeSynchronizedDataUseCase(
                activeGraph.android.timeline,
                activeGraph.android.metrics,
                activeGraph.algorithms,
            )(subject, interval)
        }
        return true
    }

    private suspend fun checkSedentaryInBackground(activeGraph: HealthGraph): Boolean {
        val activation = currentActivation
        val clock = SystemClockAdapter()
        val subject = SubjectId("current")
        if (activation is Activation.Active) {
            val now = clock.now().value
            val interval = TimeInterval.of(now - 3L * 60L * 60L * 1_000L, now).getOrNull()
            val activity = huaweiDataPlan.first { it.id == "activity" }
            if (
                interval != null &&
                activeGraph.android.consents.activeConsent(subject, "health:activity") != null
            ) {
                SyncHealthDataUseCase(
                    activeGraph.huawei,
                    activeGraph.android.timeline,
                    activeGraph.android.consents,
                    activeGraph.android.cursors,
                    clock,
                    activeGraph.android.audit,
                    activeGraph.android.quarantine,
                )(subject, activity, interval)
            }
        }

        val result = CheckSedentaryReminderUseCase(
            timeline = activeGraph.android.timeline,
            consents = activeGraph.android.consents,
            settings = activeGraph.sedentary.settings,
            state = activeGraph.sedentary.state,
            notifications = activeGraph.sedentary.notifications,
            notificationPermission = activeGraph.sedentary.notificationPermission,
            localTime = activeGraph.sedentary.localTime,
            clock = clock,
            audit = activeGraph.android.audit,
        )(subject, activation)
        return result is Result.Ok
    }
}
