import { err, ok } from '../../domain/result.js';
import { CLOCK_ERROR_CODES, clockError } from '../../ports/clock-port.js';

/**
 * Fixed-clock adapter: returns a configured Instant and can be advanced.
 * Host tests control time; the domain never reads it directly.
 */
export function createFixedClock(initialInstant, options) {
    const unavailable = !!(options && options.unavailable);
    let current = initialInstant;

    return {
        now() {
            if (unavailable) {
                return err(clockError(CLOCK_ERROR_CODES.UNAVAILABLE, null));
            }
            return ok(current);
        },
        advance(milliseconds) {
            current = Object.freeze({
                tag: 'Instant',
                epochMilliseconds: current.epochMilliseconds + milliseconds
            });
            return current;
        },
        set(instantValue) {
            current = instantValue;
            return current;
        },
        _now() {
            return current;
        }
    };
}
