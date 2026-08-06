/**
 * ClockPort/v1
 *
 * Contract: the single source of the current wall-clock instant.
 * The domain never reads time directly; time enters as a fact through this port.
 *
 * now() -> Result<ClockError, Instant>
 *
 * - Must return an Instant domain value.
 * - The domain does not assume successive calls are strictly increasing,
 *   but adapters should reflect the device wall clock.
 * - Errors: UNAVAILABLE when the platform clock cannot be read.
 */

export const CLOCK_ERROR_CODES = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE'
});

export function clockError(code, details) {
    return Object.freeze({
        tag: 'ClockError',
        code: code,
        details: details
    });
}
