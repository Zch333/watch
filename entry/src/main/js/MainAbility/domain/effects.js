function effect(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

/**
 * RegisterReminders carries the concrete intents to register and, when the
 * scheduling strategy is RecurringCalendar, the weekly recurrence rules the
 * adapter may use to register once per slot instead of once per concrete date.
 */
export function registerReminders(intents, recurrenceRules) {
    const fields = { intents: Object.freeze((intents || []).slice()) };
    if (recurrenceRules && recurrenceRules.length > 0) {
        fields.recurrenceRules = Object.freeze(recurrenceRules.slice());
    }
    return effect('RegisterReminders', fields);
}

export function cancelReminders(keys) {
    return effect('CancelReminders', { keys: Object.freeze((keys || []).slice()) });
}

export function vibrate(pattern) {
    return effect('Vibrate', { pattern: pattern });
}

export function navigate(route) {
    return effect('Navigate', { route: route });
}

export function emitDiagnostic(entry) {
    return effect('EmitDiagnostic', { entry: entry });
}

export function decision(events, effects) {
    return Object.freeze({
        tag: 'Decision',
        events: Object.freeze((events || []).slice()),
        effects: Object.freeze((effects || []).slice())
    });
}
