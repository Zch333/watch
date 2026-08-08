import { none, some } from '../../domain/option.js';
import { err, ok } from '../../domain/result.js';
import { STORE_ERROR_CODES, storeError } from '../../ports/store-port.js';

/**
 * In-memory SettingsStorePort adapter for host tests.
 * Storage-only: it never parses or migrates the snapshot.
 */
export function createMemoryStore(initial) {
    let stored = initial === undefined ? undefined : initial;
    let revision = (initial && typeof initial.revision === 'number') ? initial.revision : 0;
    let failNextSave = false;

    function saveSnapshot(expectedRevision, snapshot) {
        if (failNextSave) {
            failNextSave = false;
            return err(storeError(STORE_ERROR_CODES.IO_FAILURE, null));
        }
        if (expectedRevision !== revision) {
            return err(storeError(STORE_ERROR_CODES.CONCURRENT_MODIFICATION, Object.freeze({
                expected: expectedRevision,
                current: revision
            })));
        }
        stored = snapshot;
        revision = snapshot.revision;
        return ok(Object.freeze({ tag: 'Revision', value: revision }));
    }

    function saveSnapshotAsync(expectedRevision, snapshot, done) {
        if (typeof done !== 'function') {
            return err(storeError(STORE_ERROR_CODES.ASYNC_REQUIRED, {
                operation: 'saveSnapshotAsync',
                reason: 'callback_required'
            }));
        }
        const result = saveSnapshot(expectedRevision, snapshot);
        done(result);
        return result;
    }

    return {
        loadSnapshot() {
            if (stored === undefined) {
                return ok(none());
            }
            return ok(some(stored));
        },
        loadSnapshotAsync(done) {
            const result = this.loadSnapshot();
            if (typeof done === 'function') {
                done(result);
            }
            return result;
        },
        saveSnapshot: saveSnapshot,
        saveSnapshotAsync: saveSnapshotAsync,
        readStatus() {
            return ok(Object.freeze({
                tag: 'StoreStatus',
                revision: revision,
                hasSnapshot: stored !== undefined,
                persistenceState: 'Memory'
            }));
        },
        _seed(raw) {
            stored = raw;
            revision = (raw && typeof raw.revision === 'number') ? raw.revision : 0;
        },
        _failNextSave() {
            failNextSave = true;
        }
    };
}
