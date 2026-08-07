/**
 * SettingsStorePort/v1
 *
 * Contract: full-snapshot storage with optimistic-concurrency revision guards.
 *
 * loadSnapshot() -> Result<StoreError, Option<Snapshot>>
 * saveSnapshot(expectedRevision, snapshot) -> Result<StoreError, Revision>
 * readStatus() -> Result<StoreError, StoreStatus>
 *
 * - The adapter is storage-only: it never parses, migrates or validates the
 *   snapshot (the shell owns migration via migrateSnapshot).
 * - saveSnapshot must be all-or-nothing; on any failure the previous valid
 *   snapshot remains readable.
 * - expectedRevision mismatch returns CONCURRENT_MODIFICATION so stale pages
 *   cannot overwrite newer state.
 * - readStatus is the formal diagnostic query (revision + presence, with an
 *   optional adapter-specific persistenceState) for the
 *   diagnostics page; view code must never reach into adapter privates.
 *   StoreStatus: { tag: 'StoreStatus', revision: number, hasSnapshot: boolean }
 */

export const STORE_ERROR_CODES = Object.freeze({
    IO_FAILURE: 'IO_FAILURE',
    CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
    CORRUPT: 'CORRUPT'
});

export function storeError(code, details) {
    return Object.freeze({
        tag: 'StoreError',
        code: code,
        details: details
    });
}
