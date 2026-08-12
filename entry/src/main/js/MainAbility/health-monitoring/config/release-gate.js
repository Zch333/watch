/*
 * Health monitoring is compiled for verification but deliberately dormant.
 * Activation requires both this audited release gate and the user's switch.
 * Changing this constant is a release decision; it is not a runtime shortcut.
 */
export const HEALTH_MONITORING_RELEASE_ENABLED = false;
export const HEALTH_MONITORING_SCHEMA_VERSION = 1;

export function activationState(userEnabled, releaseEnabled) {
    const released = releaseEnabled === undefined
        ? HEALTH_MONITORING_RELEASE_ENABLED
        : releaseEnabled === true;
    if (!released) {
        return Object.freeze({
            tag: 'Dormant',
            reason: 'RELEASE_GATE_DISABLED',
            effectsAllowed: false
        });
    }
    if (userEnabled !== true) {
        return Object.freeze({
            tag: 'DisabledByUser',
            reason: 'USER_SWITCH_OFF',
            effectsAllowed: false
        });
    }
    return Object.freeze({ tag: 'Active', effectsAllowed: true });
}
