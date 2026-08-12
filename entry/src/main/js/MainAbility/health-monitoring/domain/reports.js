import { err, ok } from './model.js';
import { mean, median } from './baseline.js';

function metricGroups(metrics) {
    const groups = {};
    (metrics || []).forEach(function (metric) {
        if (metric.quality && metric.quality.tag !== 'Rejected') {
            groups[metric.metricId] = (groups[metric.metricId] || []).concat([metric]);
        }
    });
    return groups;
}

export function summarizePeriod(period, metrics, insights) {
    if (['daily', 'weekly', 'monthly'].indexOf(period) < 0) {
        return err('INVALID_REPORT_PERIOD', period);
    }
    const groups = metricGroups(metrics);
    const summaries = Object.keys(groups).sort().map(function (metricId) {
        const items = groups[metricId];
        const values = items.map(function (item) { return item.value; });
        return Object.freeze({
            metricId: metricId,
            median: median(values),
            mean: mean(values),
            minimum: Math.min.apply(Math, values),
            maximum: Math.max.apply(Math, values),
            unit: items[0].unit,
            sampleCount: values.length,
            inputIds: Object.freeze(items.map(function (item) { return item.id; }))
        });
    });
    return ok(Object.freeze({
        tag: 'HealthReport',
        period: period,
        summaries: Object.freeze(summaries),
        insights: Object.freeze((insights || []).slice()),
        correlationIsNotCausation: true,
        generatedBy: 'deterministic-period-report/1.0.0'
    }));
}

export function detectPersistentChange(metrics, baseline, options) {
    const config = options || {};
    const required = config.minimumPersistence === undefined ? 3 : config.minimumPersistence;
    const threshold = config.robustZThreshold === undefined ? 3 : config.robustZThreshold;
    const scale = baseline && baseline.mad > 0 ? baseline.mad * 1.4826 : 0;
    if (!baseline || !metrics || metrics.length < required || scale === 0) {
        return err('INSUFFICIENT_CHANGE_EVIDENCE');
    }
    const recent = metrics.slice(metrics.length - required);
    const scores = recent.map(function (item) { return (item.value - baseline.median) / scale; });
    const allUp = scores.every(function (score) { return score >= threshold; });
    const allDown = scores.every(function (score) { return score <= -threshold; });
    return ok(Object.freeze({
        tag: 'ChangeDetection',
        changed: allUp || allDown,
        direction: allUp ? 'up' : (allDown ? 'down' : 'variable'),
        persistence: recent.length,
        scores: Object.freeze(scores),
        medicalMeaning: 'not_assessed'
    }));
}

export function analyzeNOfOne(before, after, intervention) {
    if (!before || !after || before.length < 3 || after.length < 3) {
        return err('INSUFFICIENT_N_OF_ONE_DATA');
    }
    const beforeValues = before.map(function (item) { return item.value; });
    const afterValues = after.map(function (item) { return item.value; });
    const beforeMedian = median(beforeValues);
    const afterMedian = median(afterValues);
    return ok(Object.freeze({
        tag: 'NOfOneResult',
        intervention: intervention || 'unspecified',
        beforeMedian: beforeMedian,
        afterMedian: afterMedian,
        difference: afterMedian - beforeMedian,
        beforeCount: before.length,
        afterCount: after.length,
        causalClaimAllowed: false,
        limitation: '观察性自我实验只能形成相关性假设，不能自动证明因果。'
    }));
}
