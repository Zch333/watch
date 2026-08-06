function command(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

export function configureSchedule(input) {
    return command('ConfigureSchedule', { input: input });
}

export function enablePlan() {
    return command('EnablePlan');
}

export function disablePlan() {
    return command('DisablePlan');
}

export function pauseUntil(value) {
    return command('PauseUntil', { instant: value });
}

export function skipNext() {
    return command('SkipNext');
}

export function startBreak(reminderKey) {
    return command('StartBreak', { reminderKey: reminderKey });
}

export function completeBreak() {
    return command('CompleteBreak');
}

export function skipBreak() {
    return command('SkipBreak');
}

export function startBreakNow() {
    return command('StartBreakNow');
}

export function acknowledgeBreakFinished() {
    return command('AcknowledgeBreakFinished');
}

export function handleReminderFired(reminderKey, firedAt) {
    return command('HandleReminderFired', { reminderKey: reminderKey, firedAt: firedAt });
}

export function reconcilePlan(now) {
    return command('ReconcilePlan', { now: now });
}

export function observeCapability(capability) {
    return command('ObserveCapability', { capability: capability });
}

export function pauseForOneHour(nowInstant) {
    return command('PauseForOneHour', { now: nowInstant });
}

export function pauseForToday(endOfDayInstant) {
    return command('PauseForToday', { until: endOfDayInstant });
}

