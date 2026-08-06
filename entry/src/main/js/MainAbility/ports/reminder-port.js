/**
 * ReminderSchedulerPort/v1
 *
 * Contract: system reminder registration keyed by domain semantic keys.
 *
 * probeCapabilities() -> Result<ReminderError, ReminderCapability>
 * listRegistered(namespace) -> Result<ReminderError, RegisteredReminder[]>
 * register(request) -> Result<ReminderError, RegistrationReport>
 * cancel(keys) -> Result<ReminderError, CancellationReport>
 *
 * register(request):
 *   request = { intents: ReminderIntent[], recurrenceRules: RecurrenceRule[] }
 *
 * - Empty recurrenceRules means one-shot absolute-time registration.
 * - Non-empty recurrenceRules must be honored by adapters that declared
 *   supportsRecurring: register once per weekly rule instead of once per
 *   concrete date. An adapter must NEVER silently ignore the rules and
 *   report success — unsupported rule kinds are an explicit error.
 *
 * Guarantees:
 * - Registration is idempotent per semantic key: re-registering the same key
 *   does not duplicate the system reminder, but it MUST reschedule the system
 *   reminder to the intent's absolute due time (the same local key maps to a
 *   different instant after a timezone/clock change). The system id stays
 *   stable across such updates.
 * - Intents carry a resolved `dueAt` (absolute Instant); the adapter must
 *   schedule at that absolute time, never at wall-clock arithmetic.
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
