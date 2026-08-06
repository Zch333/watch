import { err, ok } from '../../domain/result.js';
import { CLOCK_ERROR_CODES, clockError } from '../../ports/clock-port.js';

function isValidInstant(value) {
    return value !== null && typeof value === 'object' &&
        value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number' &&
        isFinite(value.epochMilliseconds);
}

/**
 * Fixed-clock adapter: returns a configured Instant and can be advanced.
 * Host tests control time; the domain never reads it directly.
 *
 * Fail-fast: a "fixed" clock without a valid Instant is a programming error
 * (e.g. the product shell must never construct it from undefined), so the
 * adapter refuses to exist with an invalid initial value.
 */
export function createFixedClock(initialInstant, options) {
    if (!isValidInstant(initialInstant)) {
        throw new Error(
            'createFixedClock requires a valid Instant, got: ' + String(initialInstant)
        );
    }
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
            if (typeof milliseconds !== 'number' || !isFinite(milliseconds)) {
                throw new Error('createFixedClock.advance requires a finite number');
            }
            current = Object.freeze({
                tag: 'Instant',
                epochMilliseconds: current.epochMilliseconds + milliseconds
            });
            return current;
        },
        set(instantValue) {
            if (!isValidInstant(instantValue)) {
                throw new Error('createFixedClock.set requires a valid Instant');
            }
            current = instantValue;
            return current;
        },
        _now() {
            return current;
        }
    };
}
