import { domainError, ERROR_CODES } from '../domain/errors.js';
import { err, ok } from '../domain/result.js';

/**
 * Effect interpreter: the only place that turns effect descriptions into
 * port calls. Returns per-effect Result; the caller decides how to surface
 * failures (diagnostics, retry via reconcile).
 *
 * @param {object} effect - tagged effect from a Decision
 * @param {object} ports - injected port implementations
 * @param {object} context - { expectedRevision } for PersistSnapshot
 */
export function interpretEffect(effect, ports, context) {
    const ctx = context || {};
    switch (effect.tag) {
        case 'PersistSnapshot':
            return ports.store.saveSnapshot(ctx.expectedRevision, effect.snapshot);
        case 'QueryRegisteredReminders':
            return ports.reminders.listRegistered('move25');
        case 'RegisterReminders':
            return ports.reminders.register(effect.intents);
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
