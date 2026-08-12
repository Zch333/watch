package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import org.json.JSONObject

data class WearPeerIdentity(val packageName: String, val signingCertificateSha256: String) {
    init {
        require(packageName.matches(Regex("[A-Za-z][A-Za-z0-9_.]+")))
        require(signingCertificateSha256.replace(":", "").matches(Regex("[A-Fa-f0-9]{64}")))
    }
}

class HuaweiWearEngineAdapter(
    private val native: HuaweiNativeClient,
    private val peer: WearPeerIdentity,
) : WatchSensorPort, WatchMessagingPort {
    private val lastReceivedSequence = java.util.concurrent.ConcurrentHashMap<String, Long>()
    override suspend fun devices(): Result<DomainError, List<WearableDevice>> = runCatching {
        Result.Ok(native.pairedDevices().map { WearableDevice(it.idPseudonym, it.name, it.model, it.connected, it.worn, it.batteryPercent, it.apiLevel) })
    }.getOrElse { Result.Err(DomainError("WEAR_ENGINE_DEVICE_QUERY_FAILED", it.message)) }

    override suspend fun listSensors(device: WearableDevice): Result<DomainError, List<SensorCapability>> = runCatching {
        Result.Ok(native.sensors(device.idPseudonym).map { SensorCapability(it.id, it.maximumSampleRateHz, it.requiresApproval) })
    }.getOrElse { Result.Err(DomainError("WEAR_ENGINE_SENSOR_QUERY_FAILED", it.message)) }

    override fun open(device: WearableDevice, request: SensorSessionRequest): Flow<Result<DomainError, SensorSample>> {
        val validated = validateSession(request)
        if (validated is Result.Err) return kotlinx.coroutines.flow.flowOf(validated)
        if (!device.connected) return kotlinx.coroutines.flow.flowOf(Result.Err(DomainError("WEARABLE_NOT_CONNECTED")))
        if ((device.batteryPercent ?: 100) < request.budget.minimumBatteryPercent) return kotlinx.coroutines.flow.flowOf(Result.Err(DomainError("WATCH_BATTERY_BELOW_BUDGET")))
        return native.sensorSession(device.idPseudonym, NativeSensorRequest(request.sessionId, request.sensor, request.requestedSampleRateHz, request.requestedDurationSeconds))
            .map<NativeSensorSample, Result<DomainError, SensorSample>> { Result.Ok(SensorSample(it.sessionId, it.sequence, it.sensor, it.epochMs, it.values, it.confidence)) }
            .catch { emit(Result.Err(DomainError("WEAR_ENGINE_SENSOR_SESSION_FAILED", it.message))) }
    }

    override suspend fun close(sessionId: String): Result<DomainError, Unit> = runCatching { native.stopSensorSession(sessionId); Result.Ok(Unit) }
        .getOrElse { Result.Err(DomainError("WEAR_ENGINE_STOP_FAILED", it.message)) }

    override suspend fun ping(device: WearableDevice): Result<DomainError, Unit> = runCatching {
        native.ping(device.idPseudonym, peer.packageName, peer.signingCertificateSha256); Result.Ok(Unit)
    }.getOrElse { Result.Err(DomainError("WEAR_ENGINE_PING_FAILED", it.message)) }

    override suspend fun send(device: WearableDevice, envelope: WatchEnvelope): Result<DomainError, Unit> {
        val valid = validateWatchEnvelope(envelope, null)
        if (valid is Result.Err) return valid.map { Unit }
        return runCatching {
            val bytes = WatchWireCodec.encode(envelope)
            require(bytes.size <= 1_024) { "Wear Engine P2P message exceeds 1 KB" }
            native.sendMessage(device.idPseudonym, peer.packageName, peer.signingCertificateSha256, bytes)
            Result.Ok(Unit)
        }.getOrElse { Result.Err(DomainError("WEAR_ENGINE_SEND_FAILED", it.message)) }
    }

    override fun receive(device: WearableDevice): Flow<Result<DomainError, WatchEnvelope>> =
        native.receiveMessages(device.idPseudonym, peer.packageName, peer.signingCertificateSha256)
            .map { bytes ->
                when (val decoded = WatchWireCodec.decode(bytes)) {
                    is Result.Err -> decoded
                    is Result.Ok -> {
                        val stream = "${device.idPseudonym}:${decoded.value.sessionId.orEmpty()}"
                        val validated = validateWatchEnvelope(decoded.value, lastReceivedSequence[stream])
                        if (validated is Result.Ok && decoded.value.type != WatchMessageType.ACK) {
                            lastReceivedSequence[stream] = decoded.value.sequence
                        }
                        validated
                    }
                }
            }
            .catch { emit(Result.Err(DomainError("WEAR_ENGINE_RECEIVE_FAILED", it.message))) }
}

object WatchWireCodec {
    fun encode(value: WatchEnvelope): ByteArray = JSONObject()
        .put("v", value.protocolVersion).put("id", value.messageId).put("sid", value.sessionId)
        .put("seq", value.sequence).put("type", value.type.name).put("at", value.sentAtEpochMs)
        .put("payload", value.payloadJson).put("sha256", value.checksumSha256).toString().toByteArray()

    fun decode(bytes: ByteArray): Result<DomainError, WatchEnvelope> = runCatching {
        require(bytes.size <= 1_024)
        val json = JSONObject(bytes.decodeToString())
        val envelope = WatchEnvelope(json.getInt("v"), json.getString("id"), if (json.isNull("sid")) null else json.getString("sid"),
            json.getLong("seq"), WatchMessageType.valueOf(json.getString("type")), json.getLong("at"), json.getString("payload"), json.getString("sha256"))
        validateWatchEnvelope(envelope, null)
    }.getOrElse { Result.Err(DomainError("WATCH_WIRE_DECODE_FAILED", it.message)) }
}
