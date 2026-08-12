import { err, ok } from '../../domain/model.js';

export function createMemoryPlatformHealthPort(options) {
    const config = options || {};
    const records = (config.records || []).slice();
    const capabilities = Object.assign({}, config.capabilities || {});
    let granted = Object.assign({}, config.grantedScopes || {});
    return {
        capabilities() { return ok(Object.freeze(Object.assign({}, capabilities))); },
        requestAuthorization(scopes) {
            const list = scopes || [];
            granted = Object.assign({}, granted);
            list.forEach(function (scope) { granted[scope] = true; });
            return ok(Object.freeze({ granted: Object.freeze(list.slice()), denied: Object.freeze([]) }));
        },
        read(request) {
            const input = request || {};
            if (!granted[input.scope]) {
                return err('PLATFORM_AUTHORIZATION_REQUIRED', input.scope);
            }
            return ok(Object.freeze(records.filter(function (record) {
                return (!input.kind || record.kind === input.kind) &&
                    (!input.range || (record.endEpochMs >= input.range.startEpochMs &&
                        record.startEpochMs <= input.range.endEpochMs));
            })));
        },
        changes(cursor) {
            const start = cursor && cursor.index ? cursor.index : 0;
            return ok(Object.freeze({
                records: Object.freeze(records.slice(start)),
                cursor: Object.freeze({ index: records.length })
            }));
        },
        revoke(scopes) {
            granted = Object.assign({}, granted);
            (scopes || []).forEach(function (scope) { granted[scope] = false; });
            return ok(true);
        }
    };
}

export function createUnavailableHuaweiHealthAdapter() {
    return {
        capabilities() {
            return ok(Object.freeze({
                tag: 'RequiresApproval',
                service: 'Huawei Health Service Kit',
                reason: 'SDK scope, account, region and GT6 device evidence not supplied'
            }));
        },
        requestAuthorization() { return err('HEALTH_SERVICE_APPROVAL_REQUIRED'); },
        read() { return err('HEALTH_SERVICE_NOT_CONFIGURED'); },
        changes() { return err('HEALTH_SERVICE_NOT_CONFIGURED'); },
        revoke() { return ok(true); }
    };
}
