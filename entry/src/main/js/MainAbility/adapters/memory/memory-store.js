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

    return {
        loadSnapshot() {
            if (stored === undefined) {
                return ok(none());
            }
            return ok(some(stored));
        },
        saveSnapshot(expectedRevision, snapshot) {
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
        },
        _seed(raw) {
            stored = raw;
            revision = (raw && typeof raw.revision === 'number') ? raw.revision : 0;
        },
        _failNextSave() {
            failNextSave = true;
        },
        _peek() {
            return stored;
        },
        _revision() {
            return revision;
        }
    };
}
