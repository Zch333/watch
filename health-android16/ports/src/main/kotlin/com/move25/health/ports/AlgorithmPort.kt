package com.move25.health.ports

import com.move25.health.domain.*

data class AlgorithmRequest(val definitionId: String, val observations: List<Observation>, val interval: TimeInterval)

interface AlgorithmPort {
    fun definitions(): List<AlgorithmDefinition>
    fun execute(request: AlgorithmRequest): Result<DomainError, List<DerivedMetric>>
}

class BuiltInAlgorithmAdapter : AlgorithmPort {
    private val cards = listOf(
        definition("activity", setOf(ObservationKind.STEP_COUNT), "活动、久坐与活跃时间"),
        definition("heart_rate", setOf(ObservationKind.HEART_RATE, ObservationKind.RESTING_HEART_RATE), "心率与静息心率趋势"),
        AlgorithmDefinition("hrv", "1.0.0", ProductLevel.L2_ADVANCED, setOf("validated_rri_or_vendor_hrv"), setOf(ObservationKind.RRI), "quality/1", EvidenceGrade.E2_DEVICE_VALIDATED, "合格 RRI 的 HRV 趋势", setOf("ECG 诊断", "自主神经疾病诊断"), "Formula/public domain", "docs/algorithm-cards/hrv.md"),
        AlgorithmDefinition("prv", "1.0.0", ProductLevel.L3_RESEARCH, setOf("validated_ppg_intervals"), setOf(ObservationKind.PPG_INTERVAL), "quality/1", EvidenceGrade.E1_ENGINEERING, "研究模式 PPG 派生 PRV", setOf("ECG HRV 等价", "疾病诊断"), "Formula/public domain", "docs/algorithm-cards/prv.md"),
        definition("sleep", setOf(ObservationKind.SLEEP_DURATION), "睡眠时长、债务与规律性"),
        definition("spo2", setOf(ObservationKind.SPO2), "血氧分布与阈值样本"),
        definition("stress", setOf(ObservationKind.STRESS_VENDOR), "厂商压力趋势"),
        definition("temperature", setOf(ObservationKind.SKIN_TEMPERATURE, ObservationKind.BODY_TEMPERATURE), "温度趋势"),
        definition("workout", setOf(ObservationKind.WORKOUT_DURATION), "运动总量"),
        definition("gps_route", setOf(ObservationKind.GPS_ROUTE), "轨迹距离与配速"),
        definition("respiration", setOf(ObservationKind.RESPIRATORY_RATE), "呼吸率趋势"),
        definition("vo2max", setOf(ObservationKind.VO2MAX_VENDOR), "平台 VO2max 趋势"),
    )

    override fun definitions(): List<AlgorithmDefinition> = cards

    override fun execute(request: AlgorithmRequest): Result<DomainError, List<DerivedMetric>> {
        if (cards.none { it.id == request.definitionId }) return Result.Err(DomainError("ALGORITHM_NOT_REGISTERED", request.definitionId))
        val results = computeFeatureGroup(request.definitionId, request.observations, request.interval)
        val accepted = results.filterIsInstance<Result.Ok<DerivedMetric>>().map { it.value }
        return if (accepted.isNotEmpty()) Result.Ok(accepted)
        else results.filterIsInstance<Result.Err<DomainError>>().firstOrNull() ?: Result.Err(DomainError("ALGORITHM_NO_OUTPUT"))
    }

    private fun definition(id: String, inputs: Set<ObservationKind>, use: String) = AlgorithmDefinition(
        id, "1.0.0", ProductLevel.L1_WELLNESS, emptySet(), inputs, "quality/1", EvidenceGrade.E1_ENGINEERING,
        use, setOf("诊断", "治疗", "用药调整"), "Proprietary application code", "docs/algorithm-cards/$id.md",
    )
}
