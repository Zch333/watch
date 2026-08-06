function tagged(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

export function planDisabledState() {
    return tagged('Disabled');
}

export function planEnablingState() {
    return tagged('Enabling');
}

export function planEnabledState() {
    return tagged('Enabled');
}

export function planPausedState(until) {
    return tagged('Paused', { until: until });
}

export function planBlockedState(error) {
    return tagged('Blocked', { error: error });
}

export function noBreakState() {
    return tagged('NoBreak');
}

export function breakDueState(reminderKey, dueAt) {
    return tagged('Due', { reminderKey: reminderKey, dueAt: dueAt });
}

export function breakActiveState(sessionId, startedAt, endsAt, guidanceId) {
    return tagged('Active', {
        sessionId: sessionId,
        startedAt: startedAt,
        endsAt: endsAt,
        guidanceId: guidanceId
    });
}

export function breakFinishedState(sessionId, finishedAt, outcome) {
    return tagged('Finished', {
        sessionId: sessionId,
        finishedAt: finishedAt,
        outcome: outcome
    });
}

export function completedOutcome() {
    return tagged('Completed');
}

export function skippedOutcome() {
    return tagged('Skipped');
}

export function expiredOutcome() {
    return tagged('Expired');
}

export function capabilityUnknown() {
    return tagged('Unknown');
}

export function capabilityUnsupported(reason) {
    return tagged('Unsupported', { reason: reason });
}

export function capabilityRequiresApproval(details) {
    return tagged('RequiresApproval', { details: details });
}

export function capabilitySupported(features) {
    return tagged('Supported', { features: Object.freeze(Object.assign({}, features)) });
}

export function capabilityDegraded(reason) {
    return tagged('Degraded', { reason: reason });
}

