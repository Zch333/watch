import { mean, median } from './baseline.js';
import { err, ok } from './model.js';

function accepted(observations, kind) {
    return (observations || []).filter(function (item) {
        return item.kind === kind && item.quality && item.quality.tag !== 'Rejected';
    });
}

function values(observations, kind) {
    return accepted(observations, kind).map(function (item) { return item.value; });
}

function stats(items) {
    if (!items || items.length === 0) { return null; }
    return Object.freeze({
        count: items.length,
        minimum: Math.min.apply(Math, items),
        maximum: Math.max.apply(Math, items),
        mean: mean(items),
        median: median(items)
    });
}

function trend(items) {
    if (!items || items.length < 2) {
        return Object.freeze({ direction: 'insufficient', delta: null });
    }
    const middle = Math.max(1, Math.floor(items.length / 2));
    const first = mean(items.slice(0, middle));
    const last = mean(items.slice(middle));
    const delta = last - first;
    const tolerance = Math.max(Math.abs(first) * 0.03, 0.01);
    return Object.freeze({
        direction: delta > tolerance ? 'up' : (delta < -tolerance ? 'down' : 'stable'),
        delta: delta
    });
}

function heartRateFeatures(observations, profile) {
    const all = values(observations, 'HEART_RATE');
    const resting = values(observations, 'RESTING_HEART_RATE');
    const output = { heartRate: stats(all), restingHeartRate: stats(resting), trend: trend(resting) };
    const configuredMaximum = profile && typeof profile.maximumHeartRate === 'number'
        ? profile.maximumHeartRate
        : null;
    if (configuredMaximum && all.length > 0) {
        const counts = [0, 0, 0, 0, 0];
        all.forEach(function (value) {
            const ratio = value / configuredMaximum;
            const index = ratio < 0.6 ? 0 : (ratio < 0.7 ? 1 : (ratio < 0.8 ? 2 : (ratio < 0.9 ? 3 : 4)));
            counts[index] += 1;
        });
        output.zones = Object.freeze(counts.map(function (count, index) {
            return Object.freeze({ zone: index + 1, sampleCount: count });
        }));
        output.zoneMethod = 'configured_maximum_heart_rate';
    } else {
        output.zones = Object.freeze([]);
        output.zoneMethod = 'maximum_heart_rate_required';
    }
    const recovery = values(observations, 'HEART_RATE_RECOVERY');
    output.recovery = stats(recovery);
    return Object.freeze(output);
}

function sleepFeatures(observations, targetSleepMinutes) {
    const durations = values(observations, 'SLEEP_DURATION');
    const starts = values(observations, 'SLEEP_START_MINUTE');
    const stages = accepted(observations, 'SLEEP_STAGE_VENDOR');
    const stageTotals = {};
    stages.forEach(function (item) {
        const key = String(item.value);
        const minutes = (item.interval.endEpochMs - item.interval.startEpochMs) / 60000;
        stageTotals[key] = (stageTotals[key] || 0) + Math.max(0, minutes);
    });
    const target = typeof targetSleepMinutes === 'number' ? targetSleepMinutes : 480;
    let debt = 0;
    durations.forEach(function (duration) { debt += Math.max(0, target - duration); });
    let regularity = null;
    if (starts.length >= 3) {
        const center = median(starts);
        regularity = mean(starts.map(function (value) {
            const distance = Math.abs(value - center);
            return Math.min(distance, 1440 - distance);
        }));
    }
    return Object.freeze({
        duration: stats(durations),
        startTimeMeanDeviationMinutes: regularity,
        vendorStageMinutes: Object.freeze(stageTotals),
        sleepDebtMinutes: debt,
        trend: trend(durations),
        stageSource: stages.length > 0 ? 'vendor_estimate' : 'not_available'
    });
}

function oxygenFeatures(observations) {
    const items = values(observations, 'SPO2');
    const distribution = { below90: 0, from90To94: 0, atLeast95: 0 };
    items.forEach(function (value) {
        if (value < 90) { distribution.below90 += 1; }
        else if (value < 95) { distribution.from90To94 += 1; }
        else { distribution.atLeast95 += 1; }
    });
    return Object.freeze({
        statistics: stats(items), distribution: Object.freeze(distribution),
        trend: trend(items), singleReadingDiagnosisAllowed: false
    });
}

function stressFeatures(observations) {
    const items = values(observations, 'STRESS_VENDOR');
    return Object.freeze({
        statistics: stats(items), trend: trend(items), source: 'vendor_metric',
        crossVendorComparisonAllowed: false
    });
}

function activityFeatures(observations) {
    const steps = values(observations, 'STEP_COUNT');
    const active = values(observations, 'ACTIVE_MINUTES');
    const sedentary = values(observations, 'SEDENTARY_MINUTES');
    let stepTotal = 0;
    steps.forEach(function (value) { stepTotal += value; });
    return Object.freeze({
        steps: Object.freeze({ total: stepTotal, statistics: stats(steps), trend: trend(steps) }),
        activeMinutes: stats(active), sedentaryMinutes: stats(sedentary)
    });
}

function temperatureFeatures(observations, baseline) {
    const skin = values(observations, 'SKIN_TEMPERATURE');
    const body = values(observations, 'BODY_TEMPERATURE');
    const skinStats = stats(skin);
    const reference = baseline && typeof baseline.median === 'number' ? baseline.median : null;
    return Object.freeze({
        skin: skinStats,
        skinBaselineDelta: skinStats && reference !== null ? skinStats.median - reference : null,
        body: stats(body),
        wristIsCoreTemperature: false,
        screeningAllowed: false
    });
}

function workoutFeatures(observations) {
    const kinds = [
        ['duration', 'WORKOUT_DURATION'], ['distance', 'WORKOUT_DISTANCE'],
        ['pace', 'WORKOUT_PACE'], ['speed', 'WORKOUT_SPEED'],
        ['elevation', 'WORKOUT_ELEVATION'], ['cadence', 'WORKOUT_CADENCE'],
        ['calories', 'WORKOUT_CALORIES']
    ];
    const output = {};
    kinds.forEach(function (pair) { output[pair[0]] = stats(values(observations, pair[1])); });
    const duration = values(observations, 'WORKOUT_DURATION');
    const rpe = values(observations, 'WORKOUT_RPE');
    output.sessionRpeLoad = duration.length > 0 && rpe.length > 0
        ? duration[duration.length - 1] * rpe[rpe.length - 1]
        : null;
    output.injuryPredictionAllowed = false;
    return Object.freeze(output);
}

function routeFeatures(observations) {
    const points = accepted(observations, 'GPS_ROUTE_POINT');
    const splits = [];
    let previous = null;
    let cumulativeDistanceMeters = 0;
    function radians(value) { return value * Math.PI / 180; }
    function distanceMeters(left, right) {
        const earthRadius = 6371000;
        const latDelta = radians(right.latitude - left.latitude);
        const lonDelta = radians(right.longitude - left.longitude);
        const a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
            Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) *
            Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    points.forEach(function (item, index) {
        if (previous) {
            const elapsedSeconds = Math.max(0, (item.interval.startEpochMs - previous.interval.startEpochMs) / 1000);
            const distance = distanceMeters(previous.value, item.value);
            cumulativeDistanceMeters += distance;
            splits.push(Object.freeze({
                fromSequence: index - 1,
                toSequence: index,
                elapsedSeconds: elapsedSeconds,
                distanceMeters: distance,
                speedMetersPerSecond: elapsedSeconds > 0 ? distance / elapsedSeconds : null,
                elevationDelta: typeof item.value.elevation === 'number' && typeof previous.value.elevation === 'number'
                    ? item.value.elevation - previous.value.elevation
                    : null
            }));
        }
        previous = item;
    });
    return Object.freeze({
        pointCount: points.length,
        cumulativeDistanceMeters: cumulativeDistanceMeters,
        splits: Object.freeze(splits),
        routeScopeValidated: false,
        rawCoordinatesCloudEligible: false
    });
}

export function buildStructuredHealthSummary(observations, context) {
    const input = context || {};
    if (!observations || observations.length === 0) {
        return err('NO_OBSERVATIONS');
    }
    return ok(Object.freeze({
        schemaVersion: 1,
        period: Object.freeze(Object.assign({}, input.period || {})),
        heart: heartRateFeatures(observations, input.profile),
        hrv: Object.freeze({
            vendor: stats(values(observations, 'HRV_VENDOR')),
            rriCount: values(observations, 'RRI').length,
            granularityMustBeProbed: true
        }),
        sleep: sleepFeatures(observations, input.targetSleepMinutes),
        oxygen: oxygenFeatures(observations),
        stress: stressFeatures(observations),
        activity: activityFeatures(observations),
        temperature: temperatureFeatures(observations, input.temperatureBaseline),
        workout: workoutFeatures(observations),
        route: routeFeatures(observations),
        provenanceIds: Object.freeze(observations.map(function (item) { return item.id; })),
        deterministic: true,
        medicalDiagnosis: false
    }));
}
