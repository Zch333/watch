/**
 * HapticsPort/v1
 *
 * Contract: physical vibration with domain-level patterns only.
 *
 * vibrate(pattern) -> Result<HapticsError, Unit>
 *
 * pattern is one of: 'BreakStart' | 'BreakEnd' | 'Error'
 * The adapter maps each domain pattern to the device's concrete vibration.
 */

export const HAPTICS_ERROR_CODES = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE',
    REJECTED: 'REJECTED'
});

export function hapticsError(code, details) {
    return Object.freeze({
        tag: 'HapticsError',
        code: code,
        details: details
    });
}
