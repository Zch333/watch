import { ok } from './model.js';
import { HUAWEI_DATA_SCOPES } from './huawei-data-plan.js';

const CHANNEL_INTERVALS = Object.freeze({
    realtime_and_history: 0,
    near_realtime: 15 * 60 * 1000,
    periodic: 6 * 60 * 60 * 1000
});

export function planHealthSync(activation, nowEpochMs, lastSuccessfulById) {
    if (!activation || activation.tag !== 'Active') {
        return ok(Object.freeze([]));
    }
    const last = lastSuccessfulById || {};
    const plan = [];
    HUAWEI_DATA_SCOPES.forEach(function (item) {
        const interval = CHANNEL_INTERVALS[item.channel];
        const previous = last[item.id];
        if (interval === 0 || typeof previous !== 'number' || nowEpochMs - previous >= interval) {
            plan.push(Object.freeze({
                id: item.id,
                channel: item.channel,
                scope: item.scope,
                scopeResolution: item.scopeResolution || 'explicit_in_health_md',
                overlapMs: item.channel === 'periodic' ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000
            }));
        }
    });
    return ok(Object.freeze(plan));
}
