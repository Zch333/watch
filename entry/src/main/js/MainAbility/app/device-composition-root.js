import { createAppRuntime } from './app-runtime.js';

const REQUIRED_ADAPTERS = Object.freeze([
    'clock',
    'calendar',
    'store',
    'reminders',
    'haptics',
    'diagnostics'
]);

/**
 * Device composition root: the only place the product HAP builds its port
 * implementations. Real platform adapters must only be wired here once their
 * capability is probe-confirmed (SDK_CONFIRMED / DEVICE_CONFIRMED); guessing
 * platform APIs is forbidden by the repository evidence gate.
 *
 * `navigation` is optional: when absent the runtime treats Navigate effects
 * as no-ops, so this module stays loadable in host Node (the platform router
 * adapter is injected by the device entry `app.js` instead).
 *
 * Until the GT6 probes (delivery/20, 28) produce adapters, this root refuses
 * to assemble an app and fails fast with an explicit reason, so the product
 * never silently runs on fake adapters.
 */
export function createDeviceApp(adapters) {
    const input = adapters || {};

    const missing = [];
    for (let index = 0; index < REQUIRED_ADAPTERS.length; index += 1) {
        const name = REQUIRED_ADAPTERS[index];
        if (!input[name]) {
            missing.push(name);
        }
    }

    if (missing.length > 0) {
        throw new Error(
            'createDeviceApp: platform adapters not confirmed yet; missing ' +
            missing.join(', ') +
            '. Run capability probes (see docs/move25_gt6_funar_docs/delivery/20_CAPABILITY_PROBE_PLAN.md) ' +
            'and wire confirmed adapters here.'
        );
    }

    const ports = {
        clock: input.clock,
        calendar: input.calendar,
        store: input.store,
        reminders: input.reminders,
        haptics: input.haptics,
        diagnostics: input.diagnostics,
        navigation: input.navigation || null
    };

    return createAppRuntime(ports);
}

