/**
 * ReminderSchedulerPort/v2
 *
 * Contract: system reminder registration keyed by domain semantic keys.
 *
 * probeCapabilities() -> Result<ReminderError, ReminderCapability>
 * listRegistered(namespace) -> Result<ReminderError, RegisteredReminder[]>
 * register(request) -> Result<ReminderError, RegistrationReport>
 * cancel(keys) -> Result<ReminderError, CancellationReport>
 *
 * register(request):
 *   request = {
 *     intents: ReminderIntent[],        // one-shot absolute-time registrations
 *     recurrenceRules: RecurrenceRule[],// weekly rules (rule mode)
 *     ruleExceptions: RuleException[],  // occurrence-level suppressions
 *     now: Instant,                     // facts for the occurrence view
 *     expandDays: number                // occurrence-view window (days)
 *   }
 *
 * Two registration modes, chosen by the domain strategy:
 *
 * 1) One-shot mode (recurrenceRules empty): register once per intent,
 *    scheduled at the intent's absolute dueAt. Unchanged from v1.
 *
 * 2) Rule mode (recurrenceRules non-empty): the adapter MUST register ONE
 *    system registration per rule, identified by the rule's stable ruleKey
 *    (e.g. 'recurrence:25-5:565:Mon+Tue+Wed+Thu+Fri'). It must NOT register
 *    one system reminder per concrete intent — that is the whole point of
 *    recurring registration. Re-registering the same ruleKey (same config)
 *    is idempotent and keeps the system id stable.
 *
 * ruleExceptions: [{ ruleKey, occurrenceDate, action: 'skip'|'pause' }]
 *   Occurrence-level suppressions. The adapter must NOT fire (and must not
 *   include in its registered view) the rule's occurrence on that date.
 *   The exception set is replaced wholesale on every register call: the
 *   domain always sends the complete current suppression state.
 *
 * listRegistered() in rule mode returns the OCCURRENCE VIEW: the concrete
 * intents the rules materialize for the next expandDays days, resolved
 * per-day through the calendar (local calendar time per date — a weekly
 * rule is local-time based, so a DST switch never shifts it), filtered to
 * strictly future dueAt, with ruleExceptions applied. This is what makes
 * the domain's concrete diff converge against rule registrations.
 *
 * Callback mapping (rule -> concrete key): when a rule fires, the adapter
 * reports the occurrence with the concrete semantic key
 *   'break-start:<rhythmVersion>:<YYYY-MM-DD>:<minuteOfDay>'
 * using the LOCAL calendar date of the occurrence (per-day resolution).
 * The domain validates callbacks against the rule template + suppression.
 *
 * cancel(keys) accepts the identities currently registered: concrete
 * semantic keys in one-shot mode, ruleKeys in rule mode. Cancelling a
 * concrete key in rule mode is reported missing (occurrences are not
 * individually registered). The domain never needs to cancel individual
 * occurrences: it expresses them as ruleExceptions instead.
 *
 * RegistrationReport: { registered: [{key|ruleKey, systemId}], failed: [...] }
 *   - one-shot mode: failed entries carry `key`;
 *   - rule mode: failed entries carry `ruleKey` (rule-level failure, which
 *     is what settlement counts: Partial is judged on the RULE count).
 *
 * Guarantees:
 * - Registration is idempotent per identity (semantic key or ruleKey).
 * - Intents carry a resolved `dueAt` (absolute Instant); the adapter must
 *   schedule at that absolute time, never at wall-clock arithmetic.
 * - Partial success is reported per identity; the report exposes each
 *   failed identity.
 * - The system reminder id is adapter data; the domain identity is the
 *   semantic key / ruleKey, so an adapter must preserve it through every op.
 * - Unknown capability fields must be reported as Unknown, never guessed.
 * - The adapter must never implement long reminders with JS timers.
 * - An adapter that declared supportsRecurring must never silently ignore
 *   non-empty recurrenceRules and report success.
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
