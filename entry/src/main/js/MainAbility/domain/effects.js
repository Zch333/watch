function effect(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

export function persistSnapshot(snapshot) {
    return effect('PersistSnapshot', { snapshot: snapshot });
}

export function queryRegisteredReminders(namespace) {
    return effect('QueryRegisteredReminders', { namespace: namespace || 'move25' });
}

export function registerReminders(intents) {
    return effect('RegisterReminders', { intents: Object.freeze((intents || []).slice()) });
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
