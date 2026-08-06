import { rehydrateFromRaw } from '../domain/snapshot.js';
import { createCommandHandler } from './command-handler.js';

/**
 * Shared application runtime: the minimal imperative shell that both the
 * host (memory adapters) and the device (platform adapters) composition roots
 * build on. It owns boot, command handling and capability probing, and never
 * knows where its ports come from.
 *
 * @param {object} ports - injected port implementations (clock, calendar,
 *   store, reminders, haptics, diagnostics, navigation)
 */
export function createAppRuntime(ports) {
    const handleCommand = createCommandHandler(ports);

    return {
        ports: ports,
        handleCommand: handleCommand,

        probeCapabilities: function () {
            return ports.reminders.probeCapabilities();
        },

        boot: function () {
            const loaded = ports.store.loadSnapshot();
            if (loaded.tag === 'Err') {
                return loaded;
            }
            if (loaded.value.tag === 'None') {
                return { tag: 'Ok', state: rehydrateFromRaw(null).value };
            }
            const rehydrated = rehydrateFromRaw(loaded.value.value);
            if (rehydrated.tag === 'Err') {
                return rehydrated;
            }
            return { tag: 'Ok', state: rehydrated.value };
        }
    };
}
