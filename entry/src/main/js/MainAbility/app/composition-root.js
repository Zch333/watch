import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';
import { createMemoryHaptics } from '../adapters/memory/memory-haptics.js';
import { createMemoryStore } from '../adapters/memory/memory-store.js';
import { createRecordingNavigation } from '../adapters/memory/recording-navigation.js';
import { createRecordingReminder } from '../adapters/memory/recording-reminder.js';
import { createAppRuntime } from './app-runtime.js';

function isInstant(value) {
    return value !== null && typeof value === 'object' &&
        value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number';
}

/**
 * Host composition root: wires memory adapters behind the ports.
 * Used by host tests and as the deterministic baseline for the device shell.
 *
 * Fail-fast: a host app without a clock source (options.instant or
 * options.clock) would feed undefined into domain facts, so it is rejected
 * here instead of crashing later inside a calendar conversion.
 */
export function createHostApp(options) {
    const opts = options || {};

    if (!opts.clock && !(opts.instant && isInstant(opts.instant))) {
        throw new Error(
            'createHostApp requires options.instant (Instant) or options.clock; ' +
            'product HAP must use createDeviceApp with confirmed platform adapters'
        );
    }

    const clock = opts.clock || createFixedClock(opts.instant);
    const calendar = opts.calendar || createFixedCalendar(
        typeof opts.utcOffsetMinutes === 'number' ? opts.utcOffsetMinutes : 480
    );
    const store = opts.store || createMemoryStore();
    const reminders = opts.reminders || createRecordingReminder({
        capability: opts.capability,
        failKeys: opts.failKeys
    });
    const haptics = opts.haptics || createMemoryHaptics();
    const diagnostics = opts.diagnostics || createMemoryDiagnostics();
    const navigation = opts.navigation || createRecordingNavigation();

    const ports = {
        clock: clock,
        calendar: calendar,
        store: store,
        reminders: reminders,
        haptics: haptics,
        diagnostics: diagnostics,
        navigation: navigation
    };

    return createAppRuntime(ports);
}
