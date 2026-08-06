function effect(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

/**
 * RegisterReminders carries the concrete intents to register and, when the
 * scheduling strategy is RecurringCalendar, the weekly recurrence rules the
 * adapter must register once per rule (ruleKey identity) instead of once per
 * concrete date, plus:
 *   - ruleExceptions: occurrence-level suppressions (skip/pause) the adapter
 *     must silence when expanding or firing the rules (P1-01);
 *   - now / expandDays: the facts the adapter needs to materialize the
 *     occurrence view (future-only, same window as the desired plan) so
 *     listRegistered stays diff-convergent with the domain's plan.
 */
export function registerReminders(intents, recurrenceRules, ruleExceptions, expand) {
    const fields = { intents: Object.freeze((intents || []).slice()) };
    if (recurrenceRules && recurrenceRules.length > 0) {
        fields.recurrenceRules = Object.freeze(recurrenceRules.slice());
    }
    if (ruleExceptions && ruleExceptions.length > 0) {
        fields.ruleExceptions = Object.freeze(ruleExceptions.slice());
    }
    if (expand && typeof expand.now === 'object' && expand.now !== null) {
        fields.now = expand.now;
    }
    if (expand && typeof expand.expandDays === 'number') {
        fields.expandDays = expand.expandDays;
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
