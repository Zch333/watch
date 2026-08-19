export const FEATURE_REGISTRY = Object.freeze([
    ['activity_sedentary', 'L1', 'watch_and_phone', 'Ready', ['historical_activity']],
    ['sleep_duration_regularity', 'L1', 'phone', 'Ready', ['historical_sleep']],
    ['sleep_stage_vendor', 'L1', 'phone', 'CapabilityGated', ['vendor_sleep_stage']],
    ['resting_heart_rate', 'L1', 'phone', 'Ready', ['historical_heart_rate']],
    ['hrv_recovery', 'L2', 'phone', 'CapabilityGated', ['validated_rri']],
    ['prv_research', 'L3', 'phone_research', 'ResearchOnly', ['validated_ppg_intervals']],
    ['spo2_trend', 'L1', 'phone', 'CapabilityGated', ['historical_spo2']],
    ['respiration_trend', 'L1', 'phone', 'CapabilityGated', ['historical_respiratory_rate']],
    ['skin_temperature_trend', 'L2', 'phone', 'CapabilityGated', ['historical_skin_temperature']],
    ['vendor_stress', 'L1', 'phone', 'CapabilityGated', ['vendor_stress']],
    ['recovery_index', 'L1', 'phone', 'Ready', []],
    ['training_load', 'L2', 'phone', 'Ready', ['historical_workout']],
    ['vo2max_trend', 'L1', 'phone', 'CapabilityGated', ['vendor_vo2max']],
    ['heart_rate_recovery', 'L2', 'phone', 'CapabilityGated', ['workout_hr_series']],
    ['personal_baseline', 'L1', 'phone', 'Ready', []],
    ['change_detection', 'L2', 'phone', 'Ready', []],
    ['fall_detection', 'L3', 'phone_research', 'ResearchOnly', ['validated_acc_gyro']],
    ['arrhythmia', 'L4', 'regulated', 'ProhibitedInConsumer', ['regulated_ecg_or_ppg']],
    ['sleep_apnea', 'L4', 'regulated', 'ProhibitedInConsumer', ['regulated_sleep_study']],
    ['blood_pressure_integration', 'L4', 'phone', 'ExternalDataOnly', ['external_blood_pressure']],
    ['blood_glucose_integration', 'L4', 'phone', 'ExternalDataOnly', ['external_blood_glucose']],
    ['mood_insight', 'L1', 'phone', 'CapabilityGated', ['mood_or_user_entry']],
    ['female_health_record', 'L2', 'phone', 'ExternalDataOnly', ['cycle_user_entry']],
    ['daily_weekly_monthly_reports', 'L1', 'phone', 'Ready', []],
    ['ai_explanation', 'L1', 'phone_or_cloud', 'ConsentGated', ['validated_insight']],
    ['watch_brief_sensor_session', 'L2', 'watch', 'CapabilityGated', ['watch_sensor_session']],
    ['watch_offline_buffer', 'L1', 'watch', 'Ready', []],
    ['export_delete_consent', 'L1', 'phone', 'Ready', []],
    ['fhir_research_export', 'L3', 'phone', 'ResearchOnly', ['research_consent']]
].map(function (row) {
    return Object.freeze({
        id: row[0], level: row[1], executionTier: row[2], initialStatus: row[3],
        requiredCapabilities: Object.freeze(row[4].slice())
    });
}));

export function evaluateFeature(feature, context) {
    const item = feature || {};
    const state = context || {};
    if (!state.activation || state.activation.tag !== 'Active') {
        return Object.freeze({ tag: 'Dormant', reason: state.activation ? state.activation.reason : 'NOT_ACTIVE' });
    }
    if (item.initialStatus === 'ProhibitedInConsumer') {
        return Object.freeze({ tag: 'Unavailable', reason: 'REGULATED_PRODUCT_REQUIRED' });
    }
    if (item.initialStatus === 'ResearchOnly' && state.researchMode !== true) {
        return Object.freeze({ tag: 'Unavailable', reason: 'RESEARCH_MODE_AND_CONSENT_REQUIRED' });
    }
    if (item.initialStatus === 'ConsentGated' && state.cloudAiEnabled !== true) {
        return Object.freeze({ tag: 'Unavailable', reason: 'AI_CONSENT_REQUIRED' });
    }
    const required = item.requiredCapabilities || [];
    for (let index = 0; index < required.length; index += 1) {
        const observed = state.capabilities && state.capabilities[required[index]];
        if (!observed || observed.tag !== 'Available') {
            return Object.freeze({ tag: 'Unavailable', reason: 'CAPABILITY_NOT_AVAILABLE', capability: required[index] });
        }
    }
    return Object.freeze({ tag: 'Available' });
}

export function featurePortfolio(context) {
    return Object.freeze(FEATURE_REGISTRY.map(function (feature) {
        return Object.freeze({ feature: feature, availability: evaluateFeature(feature, context) });
    }));
}
