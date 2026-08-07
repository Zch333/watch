import { err, ok } from '../../domain/result.js';
import { instant } from '../../domain/values.js';
import { CLOCK_ERROR_CODES, clockError } from '../../ports/clock-port.js';

/**
 * Device clock backed by the platform JavaScript runtime.
 *
 * Unlike the deterministic host clock, every call reads the current time so
 * visible countdowns, pause expiry and startup reconciliation keep advancing.
 */
export function createSystemClock() {
    return {
        now() {
            const value = instant(Date.now());
            if (value.tag === 'Err') {
                return err(clockError(CLOCK_ERROR_CODES.UNAVAILABLE, value.error));
            }
            return ok(value.value);
        }
    };
}
