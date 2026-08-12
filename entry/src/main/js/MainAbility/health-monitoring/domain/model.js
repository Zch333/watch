import {
    HEALTH_MONITORING_RELEASE_ENABLED,
    HEALTH_MONITORING_SCHEMA_VERSION,
    activationState
} from '../config/release-gate.js';

export const WELLNESS_DISCLAIMER =
    '用于个人健康管理与趋势观察，不用于诊断、治疗或连续医疗监护。';

export function ok(value) {
    return Object.freeze({ tag: 'Ok', value: value });
}

export function err(code, details) {
    return Object.freeze({
        tag: 'Err',
        error: Object.freeze({ code: code, details: details || null })
    });
}

export function capability(tag, metadata) {
    const allowed = [
        'Unknown',
        'Available',
        'RequiresPermission',
        'RequiresApproval',
        'Unsupported',
        'TemporarilyUnavailable'
    ];
    if (allowed.indexOf(tag) < 0) {
        return err('INVALID_CAPABILITY', tag);
    }
    return ok(Object.freeze({ tag: tag, metadata: metadata || null }));
}

export function quality(tag, dimensions, reasons) {
    if (['Good', 'Degraded', 'Rejected'].indexOf(tag) < 0) {
        return err('INVALID_QUALITY', tag);
    }
    return ok(Object.freeze({
        tag: tag,
        dimensions: Object.freeze(Object.assign({}, dimensions || {})),
        reasons: Object.freeze((reasons || []).slice())
    }));
}

export function initialHealthState(options) {
    const input = options || {};
    const releaseEnabled = input.releaseEnabled === undefined
        ? HEALTH_MONITORING_RELEASE_ENABLED
        : input.releaseEnabled === true;
    const userEnabled = input.userEnabled === true;
    return Object.freeze({
        tag: 'HealthMonitoringState',
        schemaVersion: HEALTH_MONITORING_SCHEMA_VERSION,
        releaseEnabled: releaseEnabled,
        userEnabled: userEnabled,
        activation: activationState(userEnabled, releaseEnabled),
        consents: Object.freeze({}),
        capabilities: Object.freeze({}),
        researchMode: false,
        cloudAiEnabled: false,
        lastSyncAt: null,
        audit: Object.freeze([]),
        revision: 0
    });
}

export function withRevision(state, patch) {
    return Object.freeze(Object.assign({}, state, patch, {
        revision: state.revision + 1
    }));
}
