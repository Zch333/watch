import storage from '@system.storage';
import { none, some } from '../../domain/option.js';
import { err, ok } from '../../domain/result.js';
import { STORE_ERROR_CODES, storeError } from '../../ports/store-port.js';

const SNAPSHOT_KEY = 'move25_snapshot';

function decode(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return undefined;
    }
    if (typeof raw !== 'string') {
        return raw;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        // Keep corrupt input visible to the snapshot decoder. It must surface
        // a boot error instead of silently resetting user settings.
        return raw;
    }
}

function createLoadedStore(initial, initialError) {
    let stored = initial;
    let revision = initial && typeof initial.revision === 'number' ? initial.revision : 0;
    let persistenceState = initialError ? 'Unavailable' : 'Ready';
    let persistenceError = initialError || null;

    return {
        loadSnapshot() {
            return ok(stored === undefined ? none() : some(stored));
        },

        saveSnapshot(expectedRevision, snapshot) {
            if (expectedRevision !== revision) {
                return err(storeError(STORE_ERROR_CODES.CONCURRENT_MODIFICATION, {
                    expected: expectedRevision,
                    current: revision
                }));
            }
            let encoded;
            try {
                encoded = JSON.stringify(snapshot);
                persistenceState = 'Pending';
                storage.set({
                    key: SNAPSHOT_KEY,
                    value: encoded,
                    success: function () {
                        persistenceState = 'Ready';
                        persistenceError = null;
                    },
                    fail: function (message, code) {
                        persistenceState = 'Failed';
                        persistenceError = { message: message, code: code };
                        console.error('[Move25] snapshot persistence failed: ' + code + ' ' + message);
                    }
                });
            } catch (error) {
                persistenceState = 'Failed';
                persistenceError = error && error.message ? error.message : String(error);
                return err(storeError(STORE_ERROR_CODES.IO_FAILURE,
                    persistenceError));
            }
            // The Lite storage API acknowledges completion asynchronously.
            // The in-process cache is committed after the native request was
            // accepted; callback failures remain visible through readStatus.
            stored = snapshot;
            revision = snapshot.revision;
            return ok(Object.freeze({ tag: 'Revision', value: revision }));
        },

        readStatus() {
            return ok(Object.freeze({
                tag: 'StoreStatus',
                revision: revision,
                hasSnapshot: stored !== undefined,
                persistenceState: persistenceState,
                persistenceError: persistenceError
            }));
        }
    };
}

/**
 * Load the persistent snapshot before constructing the synchronous runtime.
 * The callback is invoked exactly once, including platform failure paths.
 */
export function openSystemStore(onReady) {
    let completed = false;
    let fallbackTimer = -1;
    const finish = function (store) {
        if (completed) {
            return;
        }
        completed = true;
        if (fallbackTimer >= 0) {
            clearTimeout(fallbackTimer);
            fallbackTimer = -1;
        }
        onReady(store);
    };
    try {
        storage.get({
            key: SNAPSHOT_KEY,
            default: '',
            success: function (data) {
                finish(createLoadedStore(decode(data), null));
            },
            fail: function (message, code) {
                console.error('[Move25] snapshot load failed: ' + code + ' ' + message);
                finish(createLoadedStore(undefined, { message: message, code: code }));
            }
        });
        // A few Lite previewer revisions expose system.storage.get but never
        // invoke either callback.  Do not leave the whole app on its loading
        // screen forever; initialize an explicit in-memory fallback instead.
        fallbackTimer = setTimeout(function () {
            finish(createLoadedStore(undefined, {
                message: 'system.storage callback timeout',
                code: 'STORAGE_CALLBACK_TIMEOUT'
            }));
        }, 500);
    } catch (error) {
        finish(createLoadedStore(undefined, {
            message: error && error.message ? error.message : String(error),
            code: 'STORAGE_UNAVAILABLE'
        }));
    }
}
