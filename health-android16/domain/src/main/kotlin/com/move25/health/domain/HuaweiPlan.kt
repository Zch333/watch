package com.move25.health.domain

enum class SyncChannel { REALTIME, NEAR_REALTIME, PERIODIC }

data class HuaweiDataGroup(
    val id: String,
    val kinds: Set<ObservationKind>,
    val channel: SyncChannel,
    val scope: String?,
    val scopeResolution: String,
    val approval: String,
    val probePriority: String,
)

val huaweiDataPlan = listOf(
    HuaweiDataGroup("heart_rate", setOf(ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE), SyncChannel.REALTIME, null, "approved_huawei_catalog", "required", "P0"),
    HuaweiDataGroup("activity", setOf(ObservationKind.STEP_COUNT, ObservationKind.ACTIVE_MINUTES, ObservationKind.SEDENTARY_MINUTES), SyncChannel.NEAR_REALTIME, null, "approved_huawei_catalog", "required", "P0"),
    HuaweiDataGroup("sleep", setOf(ObservationKind.SLEEP_DURATION, ObservationKind.SLEEP_START_MINUTE, ObservationKind.SLEEP_END_MINUTE, ObservationKind.SLEEP_STAGE_VENDOR), SyncChannel.PERIODIC, null, "approved_huawei_catalog", "required", "P0"),
    HuaweiDataGroup("spo2", setOf(ObservationKind.SPO2), SyncChannel.PERIODIC, null, "approved_huawei_catalog", "required", "P1"),
    HuaweiDataGroup("stress", setOf(ObservationKind.STRESS_VENDOR), SyncChannel.NEAR_REALTIME, null, "approved_huawei_catalog", "required", "P1"),
    HuaweiDataGroup("hrv", setOf(ObservationKind.HRV_VENDOR, ObservationKind.RRI), SyncChannel.PERIODIC, "https://www.huawei.com/healthkit/hearthealth.read", "explicit_health_md", "advanced", "P0_HIGHEST_RISK"),
    HuaweiDataGroup("temperature", setOf(ObservationKind.SKIN_TEMPERATURE, ObservationKind.BODY_TEMPERATURE), SyncChannel.PERIODIC, null, "approved_huawei_catalog", "required", "P1"),
    HuaweiDataGroup("respiration", setOf(ObservationKind.RESPIRATORY_RATE), SyncChannel.PERIODIC, null, "approved_huawei_catalog", "required", "P1"),
    HuaweiDataGroup("vo2max", setOf(ObservationKind.VO2MAX_VENDOR), SyncChannel.PERIODIC, null, "approved_huawei_catalog", "required", "P1"),
    HuaweiDataGroup("workout", setOf(ObservationKind.WORKOUT_DURATION, ObservationKind.WORKOUT_DISTANCE, ObservationKind.WORKOUT_PACE, ObservationKind.WORKOUT_SPEED, ObservationKind.WORKOUT_ELEVATION, ObservationKind.WORKOUT_CADENCE, ObservationKind.WORKOUT_CALORIES), SyncChannel.REALTIME, null, "approved_huawei_catalog", "required", "P0"),
    HuaweiDataGroup("gps_route", setOf(ObservationKind.GPS_ROUTE), SyncChannel.PERIODIC, "https://www.huawei.com/healthkit/location.read", "explicit_health_md", "route_policy_review", "P0_HIGHEST_RISK"),
)

data class SyncPolicy(val channel: SyncChannel, val minimumIntervalMinutes: Long, val overlapWindowHours: Long, val requiresUnmetered: Boolean)

val defaultSyncPolicies = listOf(
    SyncPolicy(SyncChannel.REALTIME, 0, 0, false),
    SyncPolicy(SyncChannel.NEAR_REALTIME, 15, 6, false),
    SyncPolicy(SyncChannel.PERIODIC, 360, 24, false),
)
