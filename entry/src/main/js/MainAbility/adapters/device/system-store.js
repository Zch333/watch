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

function errorCode(initialError) {
    if (initialError && typeof initialError.code === 'string') {
        return initialError.code;
    }
    return STORE_ERROR_CODES.STORAGE_UNAVAILABLE;
}

function errorMessage(error) {
    if (!error) {
        return 'Persistent storage is unavailable';
    }
    if (error.message) {
        return String(error.message);
    }
    return String(error);
}

/**
 * Build a store after the initial native read has settled.
 *
 * `saveSnapshotAsync` is the only production write path. The committed
 * snapshot and revision move forward inside the native success callback, never
 * when storage.set merely accepts a request. The two-argument saveSnapshot is
 * intentionally an explicit error for this adapter so a synchronous caller
 * cannot accidentally claim durability.
 */
export function createLoadedStore(initial, initialError, storageApi, options) {
    let stored = initial;
    let revision = initial && typeof initial.revision === 'number' ? initial.revision : 0;
    let persistenceState = initialError ? 'Unavailable' : 'Ready';
    let persistenceError = initialError || null;
    let pending = false;
    const nativeStorage = storageApi || storage;
    const opts = options || {};
    const writeTimeoutMs = typeof opts.writeTimeoutMs === 'number' && opts.writeTimeoutMs >= 0
        ? opts.writeTimeoutMs
        : 3000;

    function loadResult() {
        if (initialError) {
            return err(storeError(errorCode(initialError), initialError));
        }
        return ok(stored === undefined ? none() : some(stored));
    }

    function invoke(done, result) {
        if (typeof done === 'function') {
            done(result);
        }
        return result;
    }

    function saveSnapshotAsync(expectedRevision, snapshot, done) {
        if (typeof done !== 'function') {
            return err(storeError(STORE_ERROR_CODES.ASYNC_REQUIRED, {
                operation: 'saveSnapshotAsync',
                reason: 'callback_required'
            }));
        }
        if (initialError) {
            return invoke(done, err(storeError(errorCode(initialError), initialError)));
        }
        if (pending) {
            return invoke(done, err(storeError(STORE_ERROR_CODES.PERSISTENCE_PENDING, {
                currentRevision: revision
            })));
        }
        if (expectedRevision !== revision) {
            return invoke(done, err(storeError(STORE_ERROR_CODES.CONCURRENT_MODIFICATION, {
                expected: expectedRevision,
                current: revision
            })));
        }

        let encoded;
        try {
            encoded = JSON.stringify(snapshot);
        } catch (error) {
            persistenceState = 'Failed';
            persistenceError = error && error.message ? error.message : String(error);
            return invoke(done, err(storeError(STORE_ERROR_CODES.IO_FAILURE,
                persistenceError)));
        }

        if (!nativeStorage || typeof nativeStorage.set !== 'function') {
            persistenceState = 'Unavailable';
            persistenceError = { code: STORE_ERROR_CODES.STORAGE_UNAVAILABLE };
            return invoke(done, err(storeError(STORE_ERROR_CODES.STORAGE_UNAVAILABLE,
                persistenceError)));
        }

        pending = true;
        persistenceState = 'Pending';
        let settled = false;
        let writeTimer = -1;
        const finish = function (result, nextState, nextError) {
            if (settled) {
                return;
            }
            settled = true;
            if (writeTimer >= 0 && typeof clearTimeout === 'function') {
                clearTimeout(writeTimer);
                writeTimer = -1;
            }
            pending = false;
            persistenceState = nextState;
            persistenceError = nextError || null;
            invoke(done, result);
        };

        try {
            nativeStorage.set({
                key: SNAPSHOT_KEY,
                value: encoded,
                success: function () {
                    // Native success is the durability boundary.
                    stored = snapshot;
                    revision = snapshot.revision;
                    finish(ok(Object.freeze({
                        tag: 'Revision',
                        value: revision
                    })), 'Ready', null);
                },
                fail: function (message, code) {
                    const details = { message: message, code: code };
                    console.error('[Move25] snapshot save failed: ' + code + ' ' + message);
                    finish(err(storeError(STORE_ERROR_CODES.IO_FAILURE, details)),
                        'Failed', details);
                }
            });
        } catch (error) {
            const details = {
                message: error && error.message ? error.message : String(error)
            };
            finish(err(storeError(STORE_ERROR_CODES.IO_FAILURE, details)),
                'Failed', details);
        }
        if (!settled && typeof setTimeout === 'function') {
            writeTimer = setTimeout(function () {
                const details = {
                    message: 'Persistent storage write did not respond within ' + writeTimeoutMs + 'ms',
                    code: STORE_ERROR_CODES.STORAGE_TIMEOUT
                };
                console.error('[Move25] snapshot save timed out after ' + writeTimeoutMs + 'ms');
                finish(err(storeError(STORE_ERROR_CODES.STORAGE_TIMEOUT, details)),
                    'Failed', details);
            }, writeTimeoutMs);
        }
        return Object.freeze({
            tag: 'Pending',
            expectedRevision: expectedRevision,
            revision: snapshot && snapshot.revision
        });
    }

    function saveSnapshot(expectedRevision, snapshot, done) {
        // A callback supplied by an adapter-aware caller is an explicit opt-in
        // to the v2 contract; normal synchronous callers receive a hard error.
        if (typeof done === 'function') {
            return saveSnapshotAsync(expectedRevision, snapshot, done);
        }
        return err(storeError(STORE_ERROR_CODES.ASYNC_REQUIRED, {
            operation: 'saveSnapshot',
            reason: 'system.storage.set is callback based'
        }));
    }

    return {
        asyncOnly: true,
        loadSnapshot: function (done) {
            return invoke(done, loadResult());
        },
        loadSnapshotAsync: function (done) {
            return invoke(done, loadResult());
        },
        saveSnapshot: saveSnapshot,
        saveSnapshotAsync: saveSnapshotAsync,
        readStatus: function () {
            return ok(Object.freeze({
                tag: 'StoreStatus',
                revision: revision,
                hasSnapshot: stored !== undefined,
                persistenceState: persistenceState,
                persistenceError: persistenceError,
                pending: pending
            }));
        }
    };
}

/**
 * Load the persistent snapshot before constructing the runtime.
 *
 * There is no silent memory/default fallback. If the platform API fails or
 * never calls back, the callback receives an unavailable store after the
 * explicit timeout; the shell can show that persistence is unavailable and
 * must not present the default state as if it came from disk.
 */
export function openSystemStore(onReady, options) {
    const opts = options || {};
    const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs >= 0
        ? opts.timeoutMs
        : 3000;
    let completed = false;
    let fallbackTimer = -1;
    const finish = function (store) {
        if (completed) {
            return;
        }
        completed = true;
        if (fallbackTimer >= 0 && typeof clearTimeout === 'function') {
            clearTimeout(fallbackTimer);
            fallbackTimer = -1;
        }
        onReady(store);
    };

    if (!storage || typeof storage.get !== 'function') {
        finish(createLoadedStore(undefined, {
            message: 'system.storage.get is unavailable',
            code: STORE_ERROR_CODES.STORAGE_UNAVAILABLE
        }, storage));
        return;
    }

    try {
        storage.get({
            key: SNAPSHOT_KEY,
            default: '',
            success: function (data) {
                finish(createLoadedStore(decode(data), null, storage, {
                    writeTimeoutMs: timeoutMs
                }));
            },
            fail: function (message, code) {
                console.error('[Move25] snapshot load failed: ' + code + ' ' + message);
                finish(createLoadedStore(undefined, {
                    message: message,
                    code: code || STORE_ERROR_CODES.STORAGE_UNAVAILABLE
                }, storage));
            }
        });
    } catch (error) {
        finish(createLoadedStore(undefined, {
            message: error && error.message ? error.message : String(error),
            code: STORE_ERROR_CODES.STORAGE_UNAVAILABLE
        }, storage));
        return;
    }

    if (typeof setTimeout === 'function') {
        fallbackTimer = setTimeout(function () {
            finish(createLoadedStore(undefined, {
                message: 'Persistent storage did not respond within ' + timeoutMs + 'ms',
                code: STORE_ERROR_CODES.STORAGE_TIMEOUT
            }, storage));
        }, timeoutMs);
    }
}
