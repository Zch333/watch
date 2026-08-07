import { err, ok } from '../../domain/result.js';
import { capabilityUnsupported } from '../../domain/state.js';
import { REMINDER_ERROR_CODES, reminderError } from '../../ports/reminder-port.js';

/**
 * Honest device adapter for a capability absent from the Lite Wearable API 24
 * SysCap profile. It lets the rest of the app work without claiming that a
 * recording adapter registered real background reminders.
 */
export function createUnsupportedReminder(reason) {
    const details = reason || 'Lite Wearable API 24 has no ReminderAgent SysCap';
    return {
        probeCapabilities() {
            return ok(capabilityUnsupported(details));
        },
        listRegistered() {
            return ok(Object.freeze([]));
        },
        register() {
            return err(reminderError(REMINDER_ERROR_CODES.UNSUPPORTED, details));
        },
        cancel(keys) {
            return ok(Object.freeze({
                cancelled: Object.freeze([]),
                missing: Object.freeze((keys || []).slice())
            }));
        }
    };
}
