import { ok } from '../../domain/result.js';

/**
 * Recording HapticsPort adapter: records domain patterns for assertions.
 */
export function createMemoryHaptics() {
    const patterns = [];
    return {
        vibrate(pattern) {
            patterns.push(pattern);
            return ok(Object.freeze({ tag: 'Unit' }));
        },
        _patterns() {
            return patterns.slice();
        }
    };
}
