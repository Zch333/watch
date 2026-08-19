import { err, ok, quality } from './model.js';

export const OBSERVATION_KINDS = Object.freeze([
    'STEP_COUNT', 'ACTIVE_MINUTES', 'SEDENTARY_MINUTES',
    'SLEEP_DURATION', 'SLEEP_START_MINUTE', 'SLEEP_END_MINUTE', 'SLEEP_STAGE_VENDOR',
    'HEART_RATE', 'RESTING_HEART_RATE', 'RRI', 'PPG_PULSE_INTERVAL', 'HRV_VENDOR',
    'SPO2', 'RESPIRATORY_RATE', 'SKIN_TEMPERATURE', 'BODY_TEMPERATURE',
    'STRESS_VENDOR', 'SUBJECTIVE_FATIGUE', 'WORKOUT_DURATION', 'WORKOUT_RPE',
    'WORKOUT_TRIMP', 'VO2MAX_VENDOR', 'HEART_RATE_RECOVERY', 'WORKOUT_DISTANCE',
    'WORKOUT_PACE', 'WORKOUT_SPEED', 'WORKOUT_ELEVATION', 'WORKOUT_CADENCE',
    'WORKOUT_CALORIES', 'GPS_ROUTE_POINT',
    'BLOOD_PRESSURE_EXTERNAL', 'BLOOD_GLUCOSE_EXTERNAL', 'MOOD_ENTRY',
    'MENSTRUAL_CYCLE_ENTRY', 'ACC', 'GYRO', 'PPG_RAW', 'ECG_RAW', 'WEAR_STATE'
]);

const KIND_UNITS = Object.freeze({
    STEP_COUNT: ['count'], ACTIVE_MINUTES: ['min'], SEDENTARY_MINUTES: ['min'],
    SLEEP_DURATION: ['min'], SLEEP_START_MINUTE: ['minute_of_day'],
    SLEEP_END_MINUTE: ['minute_of_day'], SLEEP_STAGE_VENDOR: ['stage'],
    HEART_RATE: ['bpm'], RESTING_HEART_RATE: ['bpm'], RRI: ['ms'],
    PPG_PULSE_INTERVAL: ['ms'], HRV_VENDOR: ['ms'], SPO2: ['percent'],
    RESPIRATORY_RATE: ['breaths_per_min'], SKIN_TEMPERATURE: ['celsius'],
    BODY_TEMPERATURE: ['celsius'], STRESS_VENDOR: ['vendor_score'],
    SUBJECTIVE_FATIGUE: ['score_1_10'], WORKOUT_DURATION: ['min'],
    WORKOUT_RPE: ['score_1_10'], WORKOUT_TRIMP: ['au'], VO2MAX_VENDOR: ['ml_kg_min'],
    HEART_RATE_RECOVERY: ['bpm'], WORKOUT_DISTANCE: ['m'], WORKOUT_PACE: ['sec_per_km'],
    WORKOUT_SPEED: ['m_s'], WORKOUT_ELEVATION: ['m'], WORKOUT_CADENCE: ['steps_per_min'],
    WORKOUT_CALORIES: ['kcal'], GPS_ROUTE_POINT: ['lat_lon'],
    BLOOD_PRESSURE_EXTERNAL: ['mmHg'],
    BLOOD_GLUCOSE_EXTERNAL: ['mmol_L', 'mg_dL'], MOOD_ENTRY: ['score_1_10'],
    MENSTRUAL_CYCLE_ENTRY: ['cycle_day'], ACC: ['m_s2'], GYRO: ['rad_s'],
    PPG_RAW: ['adc'], ECG_RAW: ['mV'], WEAR_STATE: ['boolean']
});

function freezeProvenance(source) {
    const value = source || {};
    return Object.freeze({
        sourcePlatform: value.sourcePlatform || 'unknown',
        sourceApp: value.sourceApp || 'unknown',
        sourceDeviceModel: value.sourceDeviceModel || 'unknown',
        sourceDeviceIdPseudonym: value.sourceDeviceIdPseudonym || 'unknown',
        firmwareVersion: value.firmwareVersion || 'unknown',
        apiName: value.apiName || 'unknown',
        apiVersion: value.apiVersion || 'unknown',
        originalDataType: value.originalDataType || 'unknown',
        samplingRate: value.samplingRate === undefined ? null : value.samplingRate,
        sensorLocation: value.sensorLocation || 'unknown',
        recordId: value.recordId || null,
        consentScope: value.consentScope || null,
        processingChain: Object.freeze((value.processingChain || []).slice())
    });
}

function inRange(kind, value) {
    if (typeof value !== 'number' || !isFinite(value)) {
        if (kind === 'SLEEP_STAGE_VENDOR') {
            return typeof value === 'string' && value.length > 0;
        }
        if (kind === 'WEAR_STATE') {
            return typeof value === 'boolean';
        }
        if (kind === 'GPS_ROUTE_POINT') {
            return value && typeof value.latitude === 'number' && typeof value.longitude === 'number' &&
                value.latitude >= -90 && value.latitude <= 90 &&
                value.longitude >= -180 && value.longitude <= 180;
        }
        if (kind === 'BLOOD_PRESSURE_EXTERNAL') {
            return value && typeof value.systolic === 'number' && typeof value.diastolic === 'number' &&
                value.systolic >= 40 && value.systolic <= 300 &&
                value.diastolic >= 20 && value.diastolic <= 200;
        }
        return false;
    }
    const ranges = {
        STEP_COUNT: [0, 300000], ACTIVE_MINUTES: [0, 1440], SEDENTARY_MINUTES: [0, 1440],
        SLEEP_DURATION: [0, 1440], SLEEP_START_MINUTE: [0, 1439], SLEEP_END_MINUTE: [0, 1439],
        HEART_RATE: [20, 260], RESTING_HEART_RATE: [20, 220], RRI: [230, 3000],
        PPG_PULSE_INTERVAL: [230, 3000], HRV_VENDOR: [0, 500], SPO2: [50, 100],
        RESPIRATORY_RATE: [3, 80], SKIN_TEMPERATURE: [15, 45], BODY_TEMPERATURE: [30, 45],
        STRESS_VENDOR: [0, 100], SUBJECTIVE_FATIGUE: [1, 10], WORKOUT_DURATION: [0, 1440],
        WORKOUT_RPE: [0, 10], WORKOUT_TRIMP: [0, 5000], VO2MAX_VENDOR: [5, 100],
        HEART_RATE_RECOVERY: [-50, 180], WORKOUT_DISTANCE: [0, 1000000],
        WORKOUT_PACE: [30, 86400], WORKOUT_SPEED: [0, 100], WORKOUT_ELEVATION: [-500, 10000],
        WORKOUT_CADENCE: [0, 400], WORKOUT_CALORIES: [0, 20000],
        MOOD_ENTRY: [1, 10], MENSTRUAL_CYCLE_ENTRY: [1, 120]
    };
    const range = ranges[kind];
    return !range || (value >= range[0] && value <= range[1]);
}

function semanticKey(raw, provenance) {
    const explicit = provenance.recordId || raw.platformRecordId;
    if (explicit) {
        return [provenance.sourcePlatform, provenance.sourceDeviceIdPseudonym, raw.kind, explicit].join('|');
    }
    return [
        provenance.sourcePlatform,
        provenance.sourceDeviceIdPseudonym,
        raw.kind,
        raw.startEpochMs,
        raw.endEpochMs,
        typeof raw.value === 'object' ? JSON.stringify(raw.value) : String(raw.value),
        raw.unit
    ].join('|');
}

export function normalizeObservation(raw) {
    const input = raw || {};
    if (!input.subjectId) {
        return err('SUBJECT_REQUIRED');
    }
    if (OBSERVATION_KINDS.indexOf(input.kind) < 0) {
        return err('UNKNOWN_OBSERVATION_KIND', input.kind);
    }
    if (!input.unit || KIND_UNITS[input.kind].indexOf(input.unit) < 0) {
        return err('INVALID_OR_MISSING_UNIT', { kind: input.kind, unit: input.unit });
    }
    if (typeof input.startEpochMs !== 'number' || typeof input.endEpochMs !== 'number' ||
        input.startEpochMs > input.endEpochMs) {
        return err('INVALID_INTERVAL');
    }
    if (!inRange(input.kind, input.value)) {
        return err('VALUE_OUT_OF_RANGE', { kind: input.kind, value: input.value });
    }
    if (!input.consentScope) {
        return err('CONSENT_REFERENCE_REQUIRED');
    }
    const provenance = freezeProvenance(Object.assign({}, input.provenance || {}, {
        recordId: (input.provenance && input.provenance.recordId) || input.platformRecordId || null,
        consentScope: input.consentScope
    }));
    const initialQuality = input.quality || quality('Good', {
        semanticValidity: 1,
        temporalConsistency: 1,
        completeness: input.coverage === undefined ? 1 : input.coverage
    }, []).value;
    return ok(Object.freeze({
        tag: 'Observation',
        id: semanticKey(input, provenance),
        subjectId: input.subjectId,
        kind: input.kind,
        value: input.value,
        unit: input.unit,
        interval: Object.freeze({ startEpochMs: input.startEpochMs, endEpochMs: input.endEpochMs }),
        observedAt: input.observedAt || input.startEpochMs,
        recordedAt: input.recordedAt || null,
        syncedAt: input.syncedAt || null,
        ingestedAt: input.ingestedAt || null,
        provenance: provenance,
        consentScope: input.consentScope,
        quality: initialQuality,
        supersedes: input.supersedes || null
    }));
}

export function assessAggregateQuality(observation, policy) {
    const item = observation || {};
    const rules = policy || {};
    const reasons = [];
    const dimensions = Object.assign({}, item.quality ? item.quality.dimensions : {});
    const coverage = dimensions.completeness === undefined ? 1 : dimensions.completeness;
    if (coverage < (rules.minimumCoverage === undefined ? 0.6 : rules.minimumCoverage)) {
        reasons.push('INSUFFICIENT_COVERAGE');
    }
    if (item.provenance && item.provenance.sourceDeviceModel === 'unknown') {
        reasons.push('UNKNOWN_DEVICE');
    }
    if (rules.requiresSamplingRate && (!item.provenance || !item.provenance.samplingRate)) {
        reasons.push('SAMPLING_RATE_REQUIRED');
    }
    if (reasons.indexOf('INSUFFICIENT_COVERAGE') >= 0 ||
        reasons.indexOf('SAMPLING_RATE_REQUIRED') >= 0) {
        return quality('Rejected', dimensions, reasons).value;
    }
    if (reasons.length > 0 || coverage < 0.85) {
        return quality('Degraded', dimensions, reasons).value;
    }
    return quality('Good', dimensions, []).value;
}
