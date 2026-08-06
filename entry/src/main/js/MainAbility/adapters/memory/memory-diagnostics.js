import { ok } from '../../domain/result.js';

/**
 * In-memory DiagnosticPort adapter (newest-first ring).
 */
export function createMemoryDiagnostics(options) {
    const capacity = (options && options.capacity) || 100;
    const entries = [];
    return {
        append(entry) {
            entries.push(Object.freeze(Object.assign({}, entry)));
            if (entries.length > capacity) {
                entries.shift();
            }
            return ok(Object.freeze({ tag: 'Unit' }));
        },
        readRecent(limit) {
            return ok(Object.freeze(entries.slice(-limit).reverse()));
        },
        _all() {
            return entries.slice();
        }
    };
}
