package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/** Extended Health Service real-time heart-rate boundary; max duration prevents accidental monitoring. */
class HuaweiRealtimeHeartRateAdapter(private val native: HuaweiNativeClient) : RealtimeHeartRatePort {
    override fun observe(request: RealtimeHeartRateRequest): Flow<Result<DomainError, RealtimeHeartRateSample>> {
        if (request.maximumDurationSeconds !in 5..1_800) {
            return flowOf(Result.Err(DomainError("REALTIME_HEART_RATE_DURATION_INVALID")))
        }
        if (request.sessionId.isBlank() || request.consentId.value.isBlank()) {
            return flowOf(Result.Err(DomainError("REALTIME_HEART_RATE_CONSENT_REQUIRED")))
        }
        return native.realtimeHeartRate(NativeRealtimeHeartRateRequest(
            request.sessionId,
            request.maximumDurationSeconds,
            request.consentId,
        )).map<NativeHeartRate, Result<DomainError, RealtimeHeartRateSample>> { sample ->
            if (sample.beatsPerMinute !in 20.0..260.0) Result.Err(DomainError("REALTIME_HEART_RATE_INVALID"))
            else Result.Ok(RealtimeHeartRateSample(request.sessionId, sample.epochMs, sample.beatsPerMinute, sample.confidence))
        }.catch { emit(Result.Err(DomainError("REALTIME_HEART_RATE_FAILED", it.message))) }
    }
}
