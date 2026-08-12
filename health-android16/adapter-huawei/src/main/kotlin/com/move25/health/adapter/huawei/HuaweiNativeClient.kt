package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import kotlinx.coroutines.flow.Flow

/**
 * Anti-corruption boundary for Huawei Health Service Kit and Wear Engine.
 * The implementation belongs in the optional approved SDK source set because the AAR, data type
 * constants and scopes are account/region/approval dependent. No reflection or guessed constants
 * are allowed in production.
 */
interface HuaweiNativeClient {
    suspend fun sdkStatus(): NativeSdkStatus
    suspend fun approvedCatalog(): List<NativeDataType>
    suspend fun authorize(scopes: Set<String>): NativeAuthorization
    fun read(request: NativeReadRequest): Flow<NativeHealthRecord>
    suspend fun revoke(scopes: Set<String>)
    fun realtimeHeartRate(request: NativeRealtimeHeartRateRequest): Flow<NativeHeartRate>

    suspend fun pairedDevices(): List<NativeWearableDevice>
    suspend fun sensors(deviceId: String): List<NativeSensorCapability>
    fun sensorSession(deviceId: String, request: NativeSensorRequest): Flow<NativeSensorSample>
    suspend fun stopSensorSession(sessionId: String)
    suspend fun ping(deviceId: String, peerPackage: String, peerFingerprintSha256: String)
    suspend fun sendMessage(deviceId: String, peerPackage: String, peerFingerprintSha256: String, bytes: ByteArray)
    fun receiveMessages(deviceId: String, peerPackage: String, peerFingerprintSha256: String): Flow<ByteArray>
}

sealed interface NativeSdkStatus {
    data object Ready : NativeSdkStatus
    data class NotInstalled(val component: String) : NativeSdkStatus
    data class ApprovalRequired(val service: String) : NativeSdkStatus
    data class Unsupported(val reason: String) : NativeSdkStatus
    data class Unavailable(val reason: String) : NativeSdkStatus
}

data class NativeDataType(
    val groupId: String,
    val nativeType: String,
    val readScope: String,
    val supportedOnDevice: Boolean,
    val supportedInCloud: Boolean,
    val metadata: Map<String, String> = emptyMap(),
)

data class NativeAuthorization(val grantedScopes: Set<String>, val deniedScopes: Set<String>)
data class NativeReadRequest(val nativeTypes: Set<String>, val startEpochMs: Long, val endEpochMs: Long, val cursor: String?)
data class NativeHealthRecord(
    val id: String,
    val nativeType: String,
    val canonicalKind: ObservationKind,
    val canonicalUnit: UnitCode,
    val canonicalValueJson: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val deviceModel: String,
    val deviceIdPseudonym: String,
    val firmwareVersion: String?,
    val apiName: String,
    val apiVersion: String,
    val cursor: String?,
)

data class NativeRealtimeHeartRateRequest(val sessionId: String, val maximumDurationSeconds: Int, val consentId: ConsentId)
data class NativeHeartRate(val epochMs: Long, val beatsPerMinute: Double, val confidence: Int?)
data class NativeWearableDevice(val idPseudonym: String, val name: String, val model: String, val connected: Boolean, val worn: Boolean?, val batteryPercent: Int?, val apiLevel: Int?)
data class NativeSensorCapability(val id: String, val maximumSampleRateHz: Double?, val requiresApproval: Boolean)
data class NativeSensorRequest(val sessionId: String, val sensor: String, val sampleRateHz: Double, val durationSeconds: Int)
data class NativeSensorSample(val sessionId: String, val sequence: Long, val sensor: String, val epochMs: Long, val values: List<Double>, val confidence: Int?)

class UnlinkedHuaweiNativeClient : HuaweiNativeClient {
    private fun missing(): Nothing = error("HUAWEI_APPROVED_NATIVE_SDK_NOT_LINKED")
    override suspend fun sdkStatus(): NativeSdkStatus = NativeSdkStatus.NotInstalled("Health Service Kit / Wear Engine approved AAR")
    override suspend fun approvedCatalog(): List<NativeDataType> = emptyList()
    override suspend fun authorize(scopes: Set<String>): NativeAuthorization = missing()
    override fun read(request: NativeReadRequest): Flow<NativeHealthRecord> = kotlinx.coroutines.flow.flow { missing() }
    override suspend fun revoke(scopes: Set<String>) = Unit
    override fun realtimeHeartRate(request: NativeRealtimeHeartRateRequest): Flow<NativeHeartRate> = kotlinx.coroutines.flow.flow { missing() }
    override suspend fun pairedDevices(): List<NativeWearableDevice> = emptyList()
    override suspend fun sensors(deviceId: String): List<NativeSensorCapability> = emptyList()
    override fun sensorSession(deviceId: String, request: NativeSensorRequest): Flow<NativeSensorSample> = kotlinx.coroutines.flow.flow { missing() }
    override suspend fun stopSensorSession(sessionId: String) = Unit
    override suspend fun ping(deviceId: String, peerPackage: String, peerFingerprintSha256: String) = missing()
    override suspend fun sendMessage(deviceId: String, peerPackage: String, peerFingerprintSha256: String, bytes: ByteArray) = missing()
    override fun receiveMessages(deviceId: String, peerPackage: String, peerFingerprintSha256: String): Flow<ByteArray> = kotlinx.coroutines.flow.flow { missing() }
}
