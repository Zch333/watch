import { ok } from '../../domain/model.js';

export function createMemoryConsentStore() {
    let values = {};
    return {
        read(scope) { return ok(values[scope] === true); },
        write(scope, consent) {
            values = Object.assign({}, values);
            values[scope] = consent === true;
            return ok(values[scope]);
        },
        revoke(scope) {
            values = Object.assign({}, values);
            values[scope] = false;
            return ok(true);
        }
    };
}

export function createMemoryCapabilityStore(seed) {
    let values = Object.assign({}, seed || {});
    return {
        read(id) { return ok(values[id] || Object.freeze({ tag: 'Unknown' })); },
        write(id, value) {
            values = Object.assign({}, values);
            values[id] = Object.freeze(Object.assign({}, value));
            return ok(values[id]);
        }
    };
}

export function createMemoryAuditPort(capacity) {
    const limit = capacity || 200;
    let entries = [];
    return {
        append(entry) {
            entries = entries.concat([Object.freeze(Object.assign({}, entry))]).slice(-limit);
            return ok(true);
        },
        readRecent(count) {
            return ok(Object.freeze(entries.slice(-count).reverse()));
        }
    };
}
