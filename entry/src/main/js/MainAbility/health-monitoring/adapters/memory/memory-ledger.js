import { err, ok } from '../../domain/model.js';
import { dedupeTimeline, windowTimeline } from '../../domain/timeline.js';

export function createMemoryTimelineStore() {
    let records = [];
    let tombstones = [];
    return {
        append(batch) {
            const items = batch || [];
            if (items.some(function (item) { return !item || item.tag !== 'Observation'; })) {
                return err('INVALID_OBSERVATION_BATCH');
            }
            const before = records.length;
            records = dedupeTimeline(records.concat(items)).slice();
            return ok(Object.freeze({ accepted: records.length - before, total: records.length }));
        },
        query(query) {
            const request = query || {};
            let result = records.slice();
            if (request.subjectId) {
                result = result.filter(function (item) { return item.subjectId === request.subjectId; });
            }
            if (request.kind) {
                result = result.filter(function (item) { return item.kind === request.kind; });
            }
            if (typeof request.startEpochMs === 'number' && typeof request.endEpochMs === 'number') {
                result = windowTimeline(result, request.startEpochMs, request.endEpochMs).slice();
            }
            return ok(Object.freeze(result));
        },
        tombstone(subjectId, selector) {
            const request = selector || {};
            const deletedIds = [];
            records = records.filter(function (item) {
                const match = item.subjectId === subjectId && (!request.kind || item.kind === request.kind);
                if (match) { deletedIds.push(item.id); }
                return !match;
            });
            tombstones = tombstones.concat(deletedIds.map(function (id) {
                return Object.freeze({ subjectId: subjectId, observationId: id });
            }));
            return ok(Object.freeze({ deleted: deletedIds.length }));
        },
        transaction(work) {
            if (typeof work !== 'function') {
                return err('TRANSACTION_WORK_REQUIRED');
            }
            return work(this);
        },
        tombstones() { return ok(Object.freeze(tombstones.slice())); }
    };
}
