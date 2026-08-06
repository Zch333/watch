function event(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

export function scheduleConfigured(settings) {
    return event('ScheduleConfigured', { settings: settings });
}

export function planEnableRequested() {
    return event('PlanEnableRequested');
}

export function planEnabled() {
    return event('PlanEnabled');
}

export function planDisabled() {
    return event('PlanDisabled');
}

export function planPaused(until, pause) {
    return event('PlanPaused', { until: until, pause: pause });
}

export function planResumed() {
    return event('PlanResumed');
}

export function planBlocked(error) {
    return event('PlanBlocked', { error: error });
}

export function nextReminderSkipped(reminderKey) {
    return event('NextReminderSkipped', { reminderKey: reminderKey });
}

export function breakBecameDue(reminderKey, dueAt) {
    return event('BreakBecameDue', { reminderKey: reminderKey, dueAt: dueAt });
}

export function breakStarted(sessionId, startedAt, endsAt, guidanceId, nextGuidanceIndex) {
    return event('BreakStarted', {
        sessionId: sessionId,
        startedAt: startedAt,
        endsAt: endsAt,
        guidanceId: guidanceId,
        nextGuidanceIndex: nextGuidanceIndex
    });
}

export function breakFinished(sessionId, finishedAt, outcome) {
    return event('BreakFinished', {
        sessionId: sessionId,
        finishedAt: finishedAt,
        outcome: outcome
    });
}

export function planReconciled(diff) {
    return event('PlanReconciled', { diff: diff });
}

export function capabilityObserved(capability) {
    return event('CapabilityObserved', { capability: capability });
}

export function breakSkipped(sessionId, finishedAt) {
    return event('BreakSkipped', {
        sessionId: sessionId,
        finishedAt: finishedAt
    });
}

export function breakAcknowledged(sessionId) {
    return event('BreakAcknowledged', { sessionId: sessionId });
}

export function suppressionCleared() {
    return event('SuppressionCleared');
}

