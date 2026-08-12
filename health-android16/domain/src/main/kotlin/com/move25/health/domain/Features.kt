package com.move25.health.domain

enum class FeatureStatus { READY, CAPABILITY_GATED, CONSENT_GATED, EXTERNAL_DATA_ONLY, RESEARCH_ONLY, REGULATED_ONLY }

data class AlgorithmDefinition(
    val id: String,
    val version: String,
    val level: ProductLevel,
    val requiredCapabilities: Set<String>,
    val requiredInputs: Set<ObservationKind>,
    val qualityPolicyId: String,
    val evidenceGrade: EvidenceGrade,
    val intendedUse: String,
    val prohibitedClaims: Set<String>,
    val license: String,
    val algorithmCard: String,
)

data class FeatureDefinition(
    val id: String,
    val name: String,
    val level: ProductLevel,
    val executionTier: String,
    val status: FeatureStatus,
    val requiredCapabilities: Set<String> = emptySet(),
)

val featureRegistry: List<FeatureDefinition> = listOf(
    FeatureDefinition("activity_sedentary", "活动、步数与久坐", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY, setOf("historical_activity")),
    FeatureDefinition("sleep_duration_regularity", "睡眠时长与规律", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY, setOf("historical_sleep")),
    FeatureDefinition("sleep_stage_vendor", "华为睡眠阶段解释", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("vendor_sleep_stage")),
    FeatureDefinition("resting_heart_rate", "静息心率趋势", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY, setOf("historical_heart_rate")),
    FeatureDefinition("hrv_recovery", "HRV 恢复趋势", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.CAPABILITY_GATED, setOf("validated_rri_or_vendor_hrv")),
    FeatureDefinition("prv_research", "PPG 派生 PRV", ProductLevel.L3_RESEARCH, "research", FeatureStatus.RESEARCH_ONLY, setOf("validated_ppg_intervals")),
    FeatureDefinition("spo2_trend", "血氧趋势", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("historical_spo2")),
    FeatureDefinition("respiration_trend", "呼吸率趋势", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("historical_respiration")),
    FeatureDefinition("temperature_trend", "体表温度趋势", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.CAPABILITY_GATED, setOf("historical_temperature")),
    FeatureDefinition("stress_recovery", "压力与恢复", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("vendor_stress")),
    FeatureDefinition("recovery_index", "可解释恢复指数", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY),
    FeatureDefinition("training_load", "训练负荷", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.CAPABILITY_GATED, setOf("historical_workout")),
    FeatureDefinition("vo2max", "VO2max 趋势", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("vendor_vo2max")),
    FeatureDefinition("heart_rate_recovery", "运动后心率恢复", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.CAPABILITY_GATED, setOf("workout_hr_series")),
    FeatureDefinition("personal_baseline", "个人基线", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY),
    FeatureDefinition("change_detection", "持续变化检测", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.READY),
    FeatureDefinition("fall_detection", "跌倒研究", ProductLevel.L3_RESEARCH, "research", FeatureStatus.RESEARCH_ONLY, setOf("validated_acc_gyro")),
    FeatureDefinition("arrhythmia", "心律失常", ProductLevel.L4_REGULATED, "regulated", FeatureStatus.REGULATED_ONLY),
    FeatureDefinition("sleep_apnea", "睡眠呼吸暂停", ProductLevel.L4_REGULATED, "regulated", FeatureStatus.REGULATED_ONLY),
    FeatureDefinition("blood_pressure", "外部血压整合", ProductLevel.L4_REGULATED, "phone", FeatureStatus.EXTERNAL_DATA_ONLY),
    FeatureDefinition("blood_glucose", "外部血糖整合", ProductLevel.L4_REGULATED, "phone", FeatureStatus.EXTERNAL_DATA_ONLY),
    FeatureDefinition("mood", "情绪洞察", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.CAPABILITY_GATED, setOf("mood_or_user_entry")),
    FeatureDefinition("female_health", "女性健康记录", ProductLevel.L2_ADVANCED, "phone", FeatureStatus.EXTERNAL_DATA_ONLY),
    FeatureDefinition("period_reports", "日周月报告", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY),
    FeatureDefinition("ai_explanation", "AI 解释", ProductLevel.L1_WELLNESS, "backend", FeatureStatus.CONSENT_GATED, setOf("validated_insight")),
    FeatureDefinition("watch_brief_session", "手表短时传感器会话", ProductLevel.L2_ADVANCED, "watch", FeatureStatus.CAPABILITY_GATED, setOf("wear_engine_sensor")),
    FeatureDefinition("watch_buffer", "手表断连缓冲", ProductLevel.L1_WELLNESS, "watch", FeatureStatus.READY),
    FeatureDefinition("privacy_control", "授权、导出与删除", ProductLevel.L1_WELLNESS, "phone", FeatureStatus.READY),
    FeatureDefinition("fhir_research_export", "FHIR 研究导出", ProductLevel.L3_RESEARCH, "research", FeatureStatus.RESEARCH_ONLY),
)

data class FeatureContext(
    val active: Boolean,
    val capabilities: Map<String, Capability>,
    val aiConsent: Boolean,
    val researchMode: Boolean,
    val regulatedProduct: Boolean = false,
)

fun featureAvailability(feature: FeatureDefinition, context: FeatureContext): Capability {
    if (!context.active) return Capability.Unsupported("HEALTH_MONITORING_DORMANT")
    if (feature.status == FeatureStatus.REGULATED_ONLY && !context.regulatedProduct) return Capability.RequiresApproval("REGULATED_PRODUCT")
    if (feature.status == FeatureStatus.RESEARCH_ONLY && !context.researchMode) return Capability.RequiresApproval("RESEARCH_MODE_AND_CONSENT")
    if (feature.status == FeatureStatus.CONSENT_GATED && !context.aiConsent) return Capability.RequiresPermission(setOf("AI_EXPLANATION"))
    feature.requiredCapabilities.forEach { id ->
        val capability = context.capabilities[id] ?: Capability.Unknown
        if (capability !is Capability.Available) return capability
    }
    return Capability.Available()
}
