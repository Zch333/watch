import { err, ok } from './model.js';

function sorted(items) {
    return items.slice().sort(function (left, right) {
        if (left.interval.startEpochMs !== right.interval.startEpochMs) {
            return left.interval.startEpochMs - right.interval.startEpochMs;
        }
        return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0);
    });
}

export function emptyTimeline() {
    return Object.freeze([]);
}

export function dedupeTimeline(timeline) {
    const byId = {};
    const input = timeline || [];
    for (let index = 0; index < input.length; index += 1) {
        const item = input[index];
        if (!byId[item.id] || (item.ingestedAt || 0) >= (byId[item.id].ingestedAt || 0)) {
            byId[item.id] = item;
        }
    }
    return Object.freeze(sorted(Object.keys(byId).map(function (id) { return byId[id]; })));
}

export function appendObservation(timeline, observation) {
    if (!observation || observation.tag !== 'Observation') {
        return err('INVALID_OBSERVATION');
    }
    return ok(dedupeTimeline((timeline || []).concat([observation])));
}

export function mergeTimelines(left, right) {
    return dedupeTimeline((left || []).concat(right || []));
}

export function windowTimeline(timeline, startEpochMs, endEpochMs) {
    return Object.freeze((timeline || []).filter(function (item) {
        return item.interval.endEpochMs >= startEpochMs && item.interval.startEpochMs <= endEpochMs;
    }));
}

export function qualifiedTimeline(timeline) {
    return Object.freeze((timeline || []).filter(function (item) {
        return item.quality && item.quality.tag !== 'Rejected';
    }));
}

export function byKind(timeline, kind) {
    return Object.freeze((timeline || []).filter(function (item) { return item.kind === kind; }));
}
