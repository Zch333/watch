import { domainError, ERROR_CODES } from '../domain/errors.js';
import { err, ok } from '../domain/result.js';

/**
 * Effect interpreter: the only place that turns effect descriptions into
 * port calls. Returns per-effect Result; the caller decides how to surface
 * failures (diagnostics, retry via reconcile, lifecycle settlement).
 *
 * Persistence is NOT an effect: the imperative shell persists the final,
 * settled state directly through the store port after a decision succeeds,
 * so the stored snapshot always reflects what really happened.
 *
 * @param {object} effect - tagged effect from a Decision
 * @param {object} ports - injected port implementations
 */
export function interpretEffect(effect, ports) {
    switch (effect.tag) {
        case 'RegisterReminders':
            // The recurrence rules must reach the adapter: they are the
            // artifact a RecurringCalendar adapter consumes (one registration
            // per weekly slot instead of one per concrete date). Dropping
            // them here would silently turn recurring registration into a
            // one-shot list of concrete intents.
            return ports.reminders.register(Object.freeze({
                intents: effect.intents,
                recurrenceRules: effect.recurrenceRules || Object.freeze([])
            }));
        case 'CancelReminders':
            return ports.reminders.cancel(effect.keys);
        case 'Vibrate':
            return ports.haptics.vibrate(effect.pattern);
        case 'Navigate':
            if (ports.navigation) {
                return ports.navigation.navigate(effect.route);
            }
            return ok(Object.freeze({ tag: 'Unit' }));
        case 'EmitDiagnostic':
            return ports.diagnostics.append(effect.entry);
        default:
            return err(domainError(ERROR_CODES.UNKNOWN_EFFECT, effect.tag));
    }
}
