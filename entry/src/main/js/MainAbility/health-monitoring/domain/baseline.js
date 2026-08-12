import { err, ok } from './model.js';

export function median(values) {
    if (!values || values.length === 0) {
        return null;
    }
    const items = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(items.length / 2);
    return items.length % 2 === 0 ? (items[middle - 1] + items[middle]) / 2 : items[middle];
}

export function mean(values) {
    if (!values || values.length === 0) {
        return null;
    }
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
        total += values[index];
    }
    return total / values.length;
}

export function mad(values, center) {
    const base = center === undefined || center === null ? median(values) : center;
    if (base === null) {
        return null;
    }
    return median(values.map(function (value) { return Math.abs(value - base); }));
}

export function buildPersonalBaseline(metricId, metrics, options) {
    const rules = options || {};
    const accepted = (metrics || []).filter(function (item) {
        return item.metricId === metricId && item.quality && item.quality.tag !== 'Rejected';
    });
    const minimum = rules.minimumSamples === undefined ? 7 : rules.minimumSamples;
    if (accepted.length < minimum) {
        return err('INSUFFICIENT_BASELINE', { required: minimum, actual: accepted.length });
    }
    const values = accepted.map(function (item) { return item.value; });
    const center = median(values);
    return ok(Object.freeze({
        tag: 'PersonalBaseline',
        metricId: metricId,
        context: rules.context || 'default',
        sampleCount: accepted.length,
        median: center,
        mad: mad(values, center),
        algorithmVersion: 'robust-median-mad/1.0.0',
        inputMetricIds: Object.freeze(accepted.map(function (item) { return item.id; }))
    }));
}

export function compareToBaseline(baseline, metric) {
    if (!baseline || !metric || baseline.metricId !== metric.metricId) {
        return err('BASELINE_METRIC_MISMATCH');
    }
    const scale = baseline.mad && baseline.mad > 0 ? baseline.mad * 1.4826 : null;
    const robustZ = scale ? (metric.value - baseline.median) / scale : 0;
    return ok(Object.freeze({
        tag: 'Deviation',
        metricId: metric.metricId,
        value: metric.value,
        baseline: baseline.median,
        robustZ: robustZ,
        direction: robustZ > 0.5 ? 'up' : (robustZ < -0.5 ? 'down' : 'stable'),
        unusual: Math.abs(robustZ) >= 3,
        medicalMeaning: 'not_assessed'
    }));
}
