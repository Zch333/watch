/**
 * ReminderSchedulerPort/v1
 *
 * Contract: system reminder registration keyed by domain semantic keys.
 *
 * probeCapabilities() -> Result<ReminderError, ReminderCapability>
 * listRegistered(namespace) -> Result<ReminderError, RegisteredReminder[]>
 * register(intents) -> Result<ReminderError, RegistrationReport>
 * cancel(keys) -> Result<ReminderError, CancellationReport>
 *
 * Guarantees:
 * - Registration is idempotent per semantic key: re-registering the same key
 *   does not duplicate the system reminder.
 * - Partial success is reported per intent; the report exposes each failed key.
 * - The system reminder id is adapter data; the domain identity is the semantic
 *   key, so an adapter must preserve the key through every operation.
 * - Unknown capability fields must be reported as Unknown, never guessed.
 * - The adapter must never implement long reminders with JS timers.
 */

export const REMINDER_ERROR_CODES = Object.freeze({
    UNSUPPORTED: 'UNSUPPORTED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
    PARTIAL_FAILURE: 'PARTIAL_FAILURE',
    INVALID_INTENT: 'INVALID_INTENT'
});

export function reminderError(code, details) {
    return Object.freeze({
        tag: 'ReminderError',
        code: code,
        details: details
    });
}
