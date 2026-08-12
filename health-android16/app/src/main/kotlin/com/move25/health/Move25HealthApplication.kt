package com.move25.health

import android.app.Application
import com.move25.health.adapter.android.AndroidAdapterFactory
import com.move25.health.adapter.android.HealthWorkScheduler
import com.move25.health.adapter.android.HealthSyncRunnerRegistry
import com.move25.health.adapter.android.SystemClockAdapter
import com.move25.health.adapter.ai.android.AdkNanoHealthAgent
import com.move25.health.adapter.ai.android.FirebaseAgentFactory
import com.move25.health.adapter.huawei.HuaweiHealthAdapter
import com.move25.health.adapter.huawei.HuaweiNativeClientProvider
import com.move25.health.adapter.huawei.HuaweiRealtimeHeartRateAdapter
import com.move25.health.adapter.huawei.HuaweiWearEngineAdapter
import com.move25.health.adapter.huawei.WearPeerIdentity
import com.move25.health.appfunctions.AppFunctionBridge
import com.move25.health.appfunctions.AppFunctionGate
import com.move25.health.domain.Activation
import com.move25.health.domain.ReleaseEvidence
import com.move25.health.domain.SubjectId
import com.move25.health.domain.TimeInterval
import com.move25.health.domain.huaweiDataPlan
import com.move25.health.domain.activationState
import com.move25.health.ports.BuiltInAlgorithmAdapter
import com.move25.health.application.AnalyzeSynchronizedDataUseCase
import com.move25.health.application.SyncHealthDataUseCase
import com.move25.health.domain.Result
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.combine

class Move25HealthApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    @Volatile private var currentActivation: Activation = Activation.Dormant("APPLICATION_STARTING")

    val graph: HealthGraph by lazy {
        val android = AndroidAdapterFactory.create(this, BuildConfig.RESEARCH_RELEASE_ENABLED)
        val native = HuaweiNativeClientProvider.current()
        val huawei = HuaweiHealthAdapter(native, cloud = null)
        val wear = runCatching {
            if (BuildConfig.HUAWEI_PEER_PACKAGE.isBlank() || BuildConfig.HUAWEI_PEER_CERT_SHA256.isBlank()) null
            else HuaweiWearEngineAdapter(native, WearPeerIdentity(BuildConfig.HUAWEI_PEER_PACKAGE, BuildConfig.HUAWEI_PEER_CERT_SHA256))
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
            huawei = huawei,
            realtimeHeartRate = HuaweiRealtimeHeartRateAdapter(native),
            algorithms = BuiltInAlgorithmAdapter(),
            localAgent = AdkNanoHealthAgent(),
            cloudAgent = FirebaseAgentFactory.createIfConfigured(this) { BuildConfig.EVIDENCE_FIREBASE_APP_CHECK },
            cloudDeletion = null,
            watchSensors = wear,
            watchMessaging = wear,
        )
    }

    override fun onCreate() {
        super.onCreate()
        val activeGraph = graph
        HealthSyncRunnerRegistry.runner = { synchronizeInBackground(activeGraph) }
        AppFunctionBridge.install(activeGraph.android.metrics, activeGraph.android.consents) { currentActivation }
        applicationScope.launch {
            combine(
                activeGraph.android.flags.observeUserEnabled(),
                activeGraph.android.flags.observeAppFunctionsEnabled(),
            ) { userEnabled, appFunctionsEnabled -> userEnabled to appFunctionsEnabled }
                .collect { (userEnabled, appFunctionsEnabled) ->
                    currentActivation = activationState(activeGraph.releaseEnabled, userEnabled, activeGraph.releaseEvidence)
                    AppFunctionGate.reconcile(this@Move25HealthApplication, currentActivation, appFunctionsEnabled)
                    HealthWorkScheduler.reconcile(this@Move25HealthApplication, activeGraph.releaseEnabled, userEnabled, activeGraph.releaseEvidence)
                }
        }
    }

    private suspend fun synchronizeInBackground(activeGraph: HealthGraph): Boolean {
        if (currentActivation !is Activation.Active) return false
        val clock = SystemClockAdapter()
        val end = clock.now().value
        val interval = TimeInterval.of(end - 30L * 86_400_000L, end).getOrNull() ?: return false
        val sync = SyncHealthDataUseCase(activeGraph.huawei, activeGraph.android.timeline, activeGraph.android.consents,
            activeGraph.android.cursors, clock, activeGraph.android.audit, activeGraph.android.quarantine)
        val subject = SubjectId("current")
        var attempted = false
        huaweiDataPlan.forEach { group ->
            if (activeGraph.android.consents.activeConsent(subject, "health:${group.id}") != null) {
                attempted = true
                sync(subject, group, interval)
            }
        }
        if (attempted) AnalyzeSynchronizedDataUseCase(activeGraph.android.timeline, activeGraph.android.metrics,
            activeGraph.algorithms)(subject, interval)
        return true
    }
}
