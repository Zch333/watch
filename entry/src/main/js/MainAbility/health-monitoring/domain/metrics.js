import { err, ok, quality } from './model.js';
import { mean, median } from './baseline.js';

function qualifiedOfKind(observations, kind) {
    return (observations || []).filter(function (item) {
        return item.kind === kind && item.quality && item.quality.tag !== 'Rejected';
    });
}

function metricId(definition, interval, inputs) {
    return [
        definition.id,
        definition.version,
        interval.startEpochMs,
        interval.endEpochMs,
        stableFingerprint(inputs.map(function (item) { return item.id; }).join('::'))
    ].join('|');
}

function stableFingerprint(text) {
    let hash = 2166136261;
    const value = String(text);
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a32:' + ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

export function derivedMetric(definition, value, unit, interval, inputs, metricQuality, uncertainty, components) {
    if (!definition || !definition.id || !definition.version || !inputs || inputs.length === 0) {
        return err('INCOMPLETE_DERIVED_METRIC');
    }
    return ok(Object.freeze({
        tag: 'DerivedMetric',
        id: metricId(definition, interval, inputs),
        metricId: definition.id,
        value: value,
        unit: unit,
        interval: Object.freeze({
            startEpochMs: interval.startEpochMs,
            endEpochMs: interval.endEpochMs
        }),
        algorithmVersion: definition.version,
        algorithmId: definition.id,
        inputIds: Object.freeze(inputs.map(function (item) { return item.id; })),
        inputHash: stableFingerprint(inputs.map(function (item) { return item.id; }).join('::')),
        quality: metricQuality,
        uncertainty: uncertainty || 'not_quantified',
        evidence: definition.evidenceGrade,
        provenance: Object.freeze({
            source: 'HealthWeave deterministic core',
            processingChain: Object.freeze([definition.id + '@' + definition.version])
        }),
        components: Object.freeze((components || []).slice())
    }));
}

function intervalOf(items) {
    let start = items[0].interval.startEpochMs;
    let end = items[0].interval.endEpochMs;
    for (let index = 1; index < items.length; index += 1) {
        start = Math.min(start, items[index].interval.startEpochMs);
        end = Math.max(end, items[index].interval.endEpochMs);
    }
    return { startEpochMs: start, endEpochMs: end };
}

function computeMedianKind(definition, observations, kind, outputUnit) {
    const items = qualifiedOfKind(observations, kind);
    if (items.length === 0) {
        return err('INPUT_NOT_AVAILABLE', kind);
    }
    return derivedMetric(
        definition,
        median(items.map(function (item) { return item.value; })),
        outputUnit,
        intervalOf(items),
        items,
        quality('Good', { completeness: 1 }, []).value,
        'distribution_not_available'
    );
}

function computeSleepRegularity(definition, observations) {
    const starts = qualifiedOfKind(observations, 'SLEEP_START_MINUTE');
    if (starts.length < 3) {
        return err('INSUFFICIENT_INPUTS', { required: 3, actual: starts.length });
    }
    const values = starts.map(function (item) { return item.value; });
    const center = median(values);
    const deviations = values.map(function (value) {
        const direct = Math.abs(value - center);
        return Math.min(direct, 1440 - direct);
    });
    const score = Math.max(0, Math.min(100, 100 - mean(deviations) * 100 / 180));
    return derivedMetric(definition, Math.round(score), 'score_0_100', intervalOf(starts), starts,
        quality('Good', { completeness: 1 }, []).value, 'heuristic', [
            Object.freeze({ name: 'mean_start_deviation_minutes', value: mean(deviations) })
        ]);
}

function computeRmssd(definition, observations, kind, label) {
    const items = qualifiedOfKind(observations, kind);
    if (items.length < 20) {
        return err('INSUFFICIENT_INTERVALS', { required: 20, actual: items.length });
    }
    let total = 0;
    for (let index = 1; index < items.length; index += 1) {
        const delta = items[index].value - items[index - 1].value;
        total += delta * delta;
    }
    const value = Math.sqrt(total / (items.length - 1));
    return derivedMetric(definition, value, 'ms', intervalOf(items), items,
        quality('Good', { sampling: 1, semanticValidity: 1 }, []).value,
        'beat_interval_quality_dependent', [Object.freeze({ name: 'label', value: label })]);
}

function computeRecovery(definition, observations) {
    const sleep = qualifiedOfKind(observations, 'SLEEP_DURATION');
    const rhr = qualifiedOfKind(observations, 'RESTING_HEART_RATE');
    const fatigue = qualifiedOfKind(observations, 'SUBJECTIVE_FATIGUE');
    if (sleep.length === 0 && rhr.length === 0 && fatigue.length === 0) {
        return err('INPUT_NOT_AVAILABLE', 'recovery_inputs');
    }
    const inputs = sleep.concat(rhr).concat(fatigue);
    const components = [];
    let weighted = 0;
    let weight = 0;
    if (sleep.length >= 3) {
        const historical = sleep.slice(0, sleep.length - 1).map(function (item) { return item.value; });
        const reference = median(historical);
        const latest = sleep[sleep.length - 1].value;
        const sleepScore = reference > 0
            ? Math.max(0, Math.min(100, 50 + (latest - reference) / reference * 100))
            : 50;
        components.push(Object.freeze({
            name: 'sleep_vs_personal_history', value: sleepScore, weight: 0.4,
            reference: reference, latest: latest
        }));
        weighted += sleepScore * 0.4;
        weight += 0.4;
    }
    if (rhr.length >= 3) {
        const historical = rhr.slice(0, rhr.length - 1).map(function (item) { return item.value; });
        const reference = median(historical);
        const latest = rhr[rhr.length - 1].value;
        const rhrScore = reference > 0
            ? Math.max(0, Math.min(100, 50 - (latest - reference) / reference * 200))
            : 50;
        components.push(Object.freeze({
            name: 'rhr_vs_personal_history', value: rhrScore, weight: 0.3,
            reference: reference, latest: latest
        }));
        weighted += rhrScore * 0.3;
        weight += 0.3;
    }
    if (fatigue.length > 0) {
        const fatigueScore = Math.max(0, Math.min(100, (11 - fatigue[fatigue.length - 1].value) * 10));
        components.push(Object.freeze({ name: 'subjective_fatigue', value: fatigueScore, weight: 0.3 }));
        weighted += fatigueScore * 0.3;
        weight += 0.3;
    }
    if (weight === 0) {
        return err('INSUFFICIENT_PERSONAL_HISTORY', { minimumPerMetric: 3 });
    }
    return derivedMetric(definition, Math.round(weighted / weight), 'score_0_100', intervalOf(inputs), inputs,
        quality('Degraded', { completeness: weight }, ['COMPOSITE_WELLNESS_INDEX']).value,
        'non_medical_composite', components);
}

function computeSessionRpe(definition, observations) {
    const durations = qualifiedOfKind(observations, 'WORKOUT_DURATION');
    const perceived = qualifiedOfKind(observations, 'WORKOUT_RPE');
    if (durations.length === 0 || perceived.length === 0) {
        return err('INPUT_NOT_AVAILABLE', 'duration_and_rpe_required');
    }
    const inputs = [durations[durations.length - 1], perceived[perceived.length - 1]];
    return derivedMetric(definition, inputs[0].value * inputs[1].value, 'au', intervalOf(inputs), inputs,
        quality('Good', { semanticValidity: 1 }, []).value, 'subjective_rpe');
}

export const BUILTIN_ALGORITHMS = Object.freeze([
    Object.freeze({
        id: 'activity.daily_steps', version: '1.0.0', requiredInputs: ['STEP_COUNT'],
        requiredCapabilities: ['historical_activity'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['calorie diagnosis']), execute: function (items) {
            const input = qualifiedOfKind(items, 'STEP_COUNT');
            if (input.length === 0) { return err('INPUT_NOT_AVAILABLE', 'STEP_COUNT'); }
            let sum = 0;
            for (let index = 0; index < input.length; index += 1) { sum += input[index].value; }
            return derivedMetric(this, sum, 'count', intervalOf(input), input,
                quality('Good', { completeness: 1 }, []).value, 'platform_aggregation');
        }
    }),
    Object.freeze({
        id: 'sleep.duration_median', version: '1.0.0', requiredInputs: ['SLEEP_DURATION'],
        requiredCapabilities: ['historical_sleep'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['sleep disorder diagnosis']), execute: function (items) {
            return computeMedianKind(this, items, 'SLEEP_DURATION', 'min');
        }
    }),
    Object.freeze({
        id: 'sleep.regularity', version: '1.0.0', requiredInputs: ['SLEEP_START_MINUTE'],
        requiredCapabilities: ['historical_sleep'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['PSG equivalence']), execute: function (items) {
            return computeSleepRegularity(this, items);
        }
    }),
    Object.freeze({
        id: 'cardio.resting_hr_median', version: '1.0.0', requiredInputs: ['RESTING_HEART_RATE'],
        requiredCapabilities: ['historical_heart_rate'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['cardiac diagnosis']), execute: function (items) {
            return computeMedianKind(this, items, 'RESTING_HEART_RATE', 'bpm');
        }
    }),
    Object.freeze({
        id: 'cardio.hrv_rmssd', version: '1.0.0', requiredInputs: ['RRI'],
        requiredCapabilities: ['validated_rri'], evidenceGrade: 'B', intendedUse: 'advanced_wellness',
        prohibitedClaims: Object.freeze(['arrhythmia diagnosis']), execute: function (items) {
            return computeRmssd(this, items, 'RRI', 'HRV_RMSSD');
        }
    }),
    Object.freeze({
        id: 'cardio.prv_rmssd', version: '1.0.0', requiredInputs: ['PPG_PULSE_INTERVAL'],
        requiredCapabilities: ['validated_ppg_intervals'], evidenceGrade: 'C', intendedUse: 'research',
        prohibitedClaims: Object.freeze(['HRV', 'arrhythmia diagnosis']), execute: function (items) {
            return computeRmssd(this, items, 'PPG_PULSE_INTERVAL', 'PRV_RMSSD');
        }
    }),
    Object.freeze({
        id: 'oxygen.spo2_median', version: '1.0.0', requiredInputs: ['SPO2'],
        requiredCapabilities: ['historical_spo2'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['sleep apnea diagnosis']), execute: function (items) {
            return computeMedianKind(this, items, 'SPO2', 'percent');
        }
    }),
    Object.freeze({
        id: 'respiration.rate_median', version: '1.0.0', requiredInputs: ['RESPIRATORY_RATE'],
        requiredCapabilities: ['historical_respiratory_rate'], evidenceGrade: 'B', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['respiratory diagnosis']), execute: function (items) {
            return computeMedianKind(this, items, 'RESPIRATORY_RATE', 'breaths_per_min');
        }
    }),
    Object.freeze({
        id: 'temperature.skin_median', version: '1.0.0', requiredInputs: ['SKIN_TEMPERATURE'],
        requiredCapabilities: ['historical_skin_temperature'], evidenceGrade: 'C', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['core temperature', 'infection diagnosis']), execute: function (items) {
            return computeMedianKind(this, items, 'SKIN_TEMPERATURE', 'celsius');
        }
    }),
    Object.freeze({
        id: 'recovery.explainable_index', version: '1.0.0',
        requiredInputs: ['SLEEP_DURATION', 'RESTING_HEART_RATE', 'SUBJECTIVE_FATIGUE'],
        requiredCapabilities: [], evidenceGrade: 'C', intendedUse: 'wellness',
        prohibitedClaims: Object.freeze(['readiness diagnosis']), execute: function (items) {
            return computeRecovery(this, items);
        }
    }),
    Object.freeze({
        id: 'training.session_rpe_load', version: '1.0.0',
        requiredInputs: ['WORKOUT_DURATION', 'WORKOUT_RPE'], requiredCapabilities: ['historical_workout'],
        evidenceGrade: 'B', intendedUse: 'wellness', prohibitedClaims: Object.freeze(['injury prediction']),
        execute: function (items) { return computeSessionRpe(this, items); }
    })
]);

export function findAlgorithm(id) {
    for (let index = 0; index < BUILTIN_ALGORITHMS.length; index += 1) {
        if (BUILTIN_ALGORITHMS[index].id === id) {
            return BUILTIN_ALGORITHMS[index];
        }
    }
    return null;
}

export function executeAlgorithm(id, observations) {
    const definition = findAlgorithm(id);
    if (!definition) {
        return err('ALGORITHM_NOT_REGISTERED', id);
    }
    const result = definition.execute(observations || []);
    if (result.tag === 'Ok' && (!result.value.algorithmVersion || !result.value.inputHash ||
        !result.value.quality || !result.value.provenance)) {
        return err('ALGORITHM_OUTPUT_INVARIANT_FAILED', id);
    }
    return result;
}
