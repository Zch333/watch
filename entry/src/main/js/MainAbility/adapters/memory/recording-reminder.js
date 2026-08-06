import { err, ok } from '../../domain/result.js';
import { REMINDER_ERROR_CODES, reminderError } from '../../ports/reminder-port.js';

/**
 * Recording ReminderSchedulerPort adapter for host tests.
 *
 * - Idempotent registration by semantic key (re-register never duplicates).
 * - Injected failKeys produce per-key partial failure reports.
 * - Capability is configured, so tests can exercise every capability branch.
 */
export function createRecordingReminder(options) {
    const opts = options || {};
    const capability = opts.capability || Object.freeze({ tag: 'Unknown' });
    const failKeys = (opts.failKeys || []).slice();
    const registry = new Map();
    let counter = 0;

    return {
        probeCapabilities() {
            if (capability.tag === 'Unsupported') {
                return err(reminderError(REMINDER_ERROR_CODES.UNSUPPORTED, null));
            }
            if (capability.tag === 'RequiresApproval') {
                return err(reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null));
            }
            return ok(capability);
        },
        listRegistered() {
            const list = [];
            registry.forEach(function (entry) {
                list.push(entry.intent);
            });
            return ok(Object.freeze(list));
        },
        register(intents) {
            const registered = [];
            const failed = [];
            for (let index = 0; index < intents.length; index += 1) {
                const intent = intents[index];
                const key = intent.key.value;
                if (failKeys.indexOf(key) >= 0) {
                    failed.push(Object.freeze({
                        key: key,
                        error: reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, { key: key })
                    }));
                    continue;
                }
                if (registry.has(key)) {
                    registered.push(Object.freeze({
                        key: key,
                        systemId: registry.get(key).systemId
                    }));
                    continue;
                }
                counter += 1;
                const systemId = 'sys-' + counter;
                registry.set(key, { systemId: systemId, intent: intent });
                registered.push(Object.freeze({ key: key, systemId: systemId }));
            }
            const report = Object.freeze({
                registered: Object.freeze(registered),
                failed: Object.freeze(failed)
            });
            if (failed.length > 0) {
                return err(reminderError(REMINDER_ERROR_CODES.PARTIAL_FAILURE, report));
            }
            return ok(report);
        },
        cancel(keys) {
            const cancelled = [];
            const missing = [];
            for (let index = 0; index < keys.length; index += 1) {
                const key = keys[index];
                if (registry.has(key)) {
                    registry.delete(key);
                    cancelled.push(key);
                } else {
                    missing.push(key);
                }
            }
            return ok(Object.freeze({
                cancelled: Object.freeze(cancelled),
                missing: Object.freeze(missing)
            }));
        },
        _registeredKeys() {
            return Array.from(registry.keys());
        },
        _clearFailKeys() {
            failKeys.length = 0;
        },
        _mappings() {
            const list = [];
            registry.forEach(function (entry) {
                list.push({ key: entry.intent.key.value, systemId: entry.systemId });
            });
            return list;
        }
    };
}
