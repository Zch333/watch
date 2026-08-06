import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';
import { createMemoryHaptics } from '../adapters/memory/memory-haptics.js';
import { createMemoryStore } from '../adapters/memory/memory-store.js';
import { createRecordingNavigation } from '../adapters/memory/recording-navigation.js';
import { createRecordingReminder } from '../adapters/memory/recording-reminder.js';
import { rehydrateFromRaw } from '../domain/snapshot.js';
import { createCommandHandler } from './command-handler.js';

/**
 * Host composition root: wires memory adapters behind the ports.
 * Used by host tests and as the deterministic baseline for the device shell.
 */
export function createHostApp(options) {
    const opts = options || {};
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
    const handleCommand = createCommandHandler(ports);

    return {
        ports: ports,
        handleCommand: handleCommand,
        probeCapabilities: function () {
            return reminders.probeCapabilities();
        },
        boot: function () {
            const loaded = store.loadSnapshot();
            if (loaded.tag === 'Err') {
                return { tag: 'Err', error: loaded.error };
            }
            if (loaded.value.tag === 'None') {
                return { tag: 'Ok', state: rehydrateFromRaw(null).value };
            }
            const rehydrated = rehydrateFromRaw(loaded.value.value);
            if (rehydrated.tag === 'Err') {
                return { tag: 'Err', error: rehydrated.error };
            }
            return { tag: 'Ok', state: rehydrated.value };
        }
    };
}
