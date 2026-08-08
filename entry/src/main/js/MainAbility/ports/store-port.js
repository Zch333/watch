/**
 * SettingsStorePort/v2
 *
 * Contract: full-snapshot storage with optimistic-concurrency revision guards.
 * The Lite system storage API is callback based, so a production adapter must
 * expose saveSnapshotAsync(expectedRevision, snapshot, done).  `done` is the
 * commit boundary: before it receives Ok, the snapshot is not durable and the
 * adapter must keep exposing the previous committed snapshot/revision.
 *
 * Synchronous loadSnapshot() and saveSnapshot() remain available for the
 * deterministic memory adapter and older host tests. Device code uses the
 * async methods through the imperative shell.
 *
 * loadSnapshot() -> Result<StoreError, Option<Snapshot>>
 * loadSnapshotAsync(done)
 * saveSnapshot(expectedRevision, snapshot) -> Result<StoreError, Revision>
 * saveSnapshotAsync(expectedRevision, snapshot, done)
 * readStatus() -> Result<StoreError, StoreStatus>
 *
 * - The adapter is storage-only: it never parses, migrates or validates the
 *   snapshot (the shell owns migration via migrateSnapshot).
 * - saveSnapshot must be all-or-nothing; on any failure the previous valid
 *   snapshot remains readable.
 * - expectedRevision mismatch returns CONCURRENT_MODIFICATION so stale pages
 *   cannot overwrite newer state.
 * - readStatus is the formal diagnostic query (revision + presence, with an
 *   optional adapter-specific persistenceState) for the diagnostics page;
 *   view code must never reach into adapter privates.
 *   StoreStatus: { tag: 'StoreStatus', revision: number, hasSnapshot: boolean }
 */

export const STORE_ERROR_CODES = Object.freeze({
    IO_FAILURE: 'IO_FAILURE',
    CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
    CORRUPT: 'CORRUPT',
    ASYNC_REQUIRED: 'ASYNC_REQUIRED',
    PERSISTENCE_PENDING: 'PERSISTENCE_PENDING',
    STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
    STORAGE_TIMEOUT: 'STORAGE_TIMEOUT'
});

export function storeError(code, details) {
    return Object.freeze({
        tag: 'StoreError',
        code: code,
        details: details
    });
}
