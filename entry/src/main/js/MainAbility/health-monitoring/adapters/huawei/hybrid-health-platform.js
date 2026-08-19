import { err, ok } from '../../domain/model.js';

function combineCapabilities(left, right) {
    const out = Object.assign({}, left || {});
    Object.keys(right || {}).forEach(function (id) {
        const incoming = right[id];
        if (!out[id] || incoming.tag === 'Available') { out[id] = incoming; }
    });
    return Object.freeze(out);
}

function dedupeRaw(records) {
    const values = {};
    (records || []).forEach(function (record) {
        const provenance = record.provenance || {};
        const key = record.platformRecordId || [
            provenance.sourcePlatform || 'huawei', provenance.sourceDeviceIdPseudonym || 'unknown',
            record.kind, record.startEpochMs, record.endEpochMs, String(record.value), record.unit
        ].join('|');
        if (!values[key] || (record.syncedAt || 0) >= (values[key].syncedAt || 0)) {
            values[key] = record;
        }
    });
    return Object.freeze(Object.keys(values).sort().map(function (key) { return values[key]; }));
}

export function createHybridHuaweiHealthPort(androidPort, cloudRestPort, policy) {
    const config = policy || {};
    if (!androidPort || !cloudRestPort) {
        throw new Error('hybrid Huawei health port requires Android and cloud REST adapters');
    }
    return {
        capabilities() {
            const local = androidPort.capabilities();
            const cloud = cloudRestPort.capabilities();
            if (local.tag === 'Err' && cloud.tag === 'Err') {
                return err('ALL_HUAWEI_DATA_PLANES_UNAVAILABLE');
            }
            return ok(combineCapabilities(
                local.tag === 'Ok' ? local.value : {},
                cloud.tag === 'Ok' ? cloud.value : {}
            ));
        },
        requestAuthorization(scopes) {
            // User authorization is initiated on Android. The cloud plane uses
            // the resulting server-side grant; it never receives an app secret.
            return androidPort.requestAuthorization(scopes);
        },
        read(request) {
            const local = androidPort.read(request);
            const cloud = cloudRestPort.read(request);
            if (local.tag === 'Err' && cloud.tag === 'Err') {
                return err('HUAWEI_READ_FAILED', { android: local.error, cloud: cloud.error });
            }
            return ok(dedupeRaw(
                (local.tag === 'Ok' ? local.value : []).concat(cloud.tag === 'Ok' ? cloud.value : [])
            ));
        },
        changes(cursor) {
            const local = androidPort.changes(cursor && cursor.android);
            const cloud = cloudRestPort.changes(cursor && cursor.cloud);
            if (local.tag === 'Err' && cloud.tag === 'Err') {
                return err('HUAWEI_INCREMENTAL_SYNC_FAILED');
            }
            const localValue = local.tag === 'Ok' ? local.value : { records: [], cursor: null };
            const cloudValue = cloud.tag === 'Ok' ? cloud.value : { records: [], cursor: null };
            return ok(Object.freeze({
                records: dedupeRaw(localValue.records.concat(cloudValue.records)),
                cursor: Object.freeze({ android: localValue.cursor, cloud: cloudValue.cursor })
            }));
        },
        revoke(scopes) {
            const local = androidPort.revoke(scopes);
            const cloud = cloudRestPort.revoke(scopes);
            return local.tag === 'Ok' && cloud.tag === 'Ok'
                ? ok(true)
                : err('HUAWEI_REVOCATION_INCOMPLETE', { android: local, cloud: cloud });
        },
        syncPolicy() {
            return Object.freeze(Object.assign({ overlapMs: 24 * 60 * 60 * 1000 }, config));
        }
    };
}
