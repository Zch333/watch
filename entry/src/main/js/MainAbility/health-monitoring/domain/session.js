import { err, ok } from './model.js';

const LIMITS = Object.freeze({
    Passive: 0,
    Brief: 5 * 60 * 1000,
    Workout: 8 * 60 * 60 * 1000,
    Research: 15 * 60 * 1000
});

export function sensorSessionRequest(raw) {
    const input = raw || {};
    if (!LIMITS.hasOwnProperty(input.mode)) {
        return err('INVALID_SENSOR_MODE', input.mode);
    }
    if (!input.purpose || !input.sensor || typeof input.maxDurationMs !== 'number') {
        return err('INCOMPLETE_SENSOR_BUDGET');
    }
    if (input.maxDurationMs <= 0 || input.maxDurationMs > LIMITS[input.mode]) {
        return err('SENSOR_DURATION_EXCEEDS_BUDGET', {
            mode: input.mode, maximum: LIMITS[input.mode], requested: input.maxDurationMs
        });
    }
    if (input.mode === 'Research' && input.researchConsent !== true) {
        return err('RESEARCH_CONSENT_REQUIRED');
    }
    return ok(Object.freeze({
        tag: 'SensorSessionRequest',
        purpose: input.purpose,
        sensor: input.sensor,
        samplingRate: input.samplingRate || null,
        maxDurationMs: input.maxDurationMs,
        expectedBatteryCost: input.expectedBatteryCost || 'unknown',
        screenPolicy: input.screenPolicy || 'allow_off',
        uploadPolicy: input.uploadPolicy || 'local_only',
        abortConditions: Object.freeze((input.abortConditions || [
            'low_battery', 'overheat', 'not_worn', 'user_cancelled'
        ]).slice()),
        mode: input.mode
    }));
}

export function createRingBuffer(capacity) {
    const limit = typeof capacity === 'number' && capacity > 0 ? Math.floor(capacity) : 256;
    let samples = [];
    return {
        append(sample) {
            samples = samples.concat([Object.freeze(Object.assign({}, sample))]);
            if (samples.length > limit) {
                samples = samples.slice(samples.length - limit);
            }
            return ok(samples.length);
        },
        read() {
            return ok(Object.freeze(samples.slice()));
        },
        acknowledge(sequence) {
            samples = samples.filter(function (sample) { return sample.sequence > sequence; });
            return ok(samples.length);
        },
        clear() {
            samples = [];
            return ok(true);
        },
        capacity() { return limit; }
    };
}
