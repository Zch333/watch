package com.move25.health

import com.move25.health.adapter.android.AndroidAdapters
import com.move25.health.domain.ReleaseEvidence
import com.move25.health.ports.AlgorithmPort
import com.move25.health.ports.CloudAgentPort
import com.move25.health.ports.CloudDeletionPort
import com.move25.health.ports.LocalAgentPort
import com.move25.health.ports.PlatformHealthPort
import com.move25.health.ports.RealtimeHeartRatePort
import com.move25.health.ports.WatchMessagingPort
import com.move25.health.ports.WatchSensorPort

data class HealthGraph(
    val releaseEnabled: Boolean,
    val releaseEvidence: ReleaseEvidence,
    val android: AndroidAdapters,
    val huawei: PlatformHealthPort,
    val realtimeHeartRate: RealtimeHeartRatePort,
    val algorithms: AlgorithmPort,
    val localAgent: LocalAgentPort,
    val cloudAgent: CloudAgentPort?,
    val cloudDeletion: CloudDeletionPort?,
    val watchSensors: WatchSensorPort?,
    val watchMessaging: WatchMessagingPort?,
)
