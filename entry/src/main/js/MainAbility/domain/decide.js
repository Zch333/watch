import { enumerateDates, instantToLocal, localToInstant } from './calendar.js';
import { decision, emitDiagnostic, navigate, persistSnapshot, registerReminders, cancelReminders, vibrate } from './effects.js';
import { domainError, ERROR_CODES } from './errors.js';
import {
    breakBecameDue,
    breakFinished,
    breakStarted,
    capabilityObserved,
    nextReminderSkipped,
    planDisabled,
    planEnabled,
    planPaused,
    planReconciled,
    scheduleConfigured
} from './events.js';
import { selectNextGuidance } from './guidance.js';
import { parseScheduleInput } from './settings.js';
import {
    applyStrategyWindow,
    assertCanEnableReliable,
    chooseSchedulingStrategy
} from './policy.js';
import {
    applySuppression,
    diffPlans,
    emptyPlan,
    findIntentByKey,
    firstFutureIntent,
    generateRangePlan,
    noPause,
    noSkip,
    pauseThroughLocal
} from './plan.js';
import { err, ok } from './result.js';
import { completedOutcome, skippedOutcome } from './state.js';
import { instant } from './values.js';

const DEFAULT_HORIZON_DAYS = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;

function event(tag, fields) {
    return Object.freeze(Object.assign({ tag: tag }, fields || {}));
}

function buildDesiredPlan(state, facts) {
    const horizon = typeof facts.horizonDays === 'number' ? facts.horizonDays : DEFAULT_HORIZON_DAYS;
    const datesResult = enumerateDates(facts.localWall.localDate, horizon);
    if (datesResult.tag === 'Err') {
        return datesResult;
    }
    const rawPlan = generateRangePlan(datesResult.value, state.settings);
    const pause = state.pause || noPause();
    const skip = state.skip || noSkip();
    const suppressed = applySuppression(rawPlan, pause, skip);
    // Drop past intents for today
    const future = [];
    for (let index = 0; index < suppressed.length; index += 1) {
        const intent = suppressed[index];
        const date = intent.localDate;
        const wall = facts.localWall;
        const dateOrder = (date.year - wall.localDate.year) ||
            (date.month - wall.localDate.month) ||
            (date.day - wall.localDate.day);
        if (dateOrder > 0 || (dateOrder === 0 && intent.at.value > wall.minuteOfDay.value)) {
            future.push(intent);
        }
    }
    return ok(Object.freeze(future));
}

function snapshotFrom(state) {
    return Object.freeze({
        tag: 'Snapshot',
        schemaVersion: 1,
        revision: state.revision,
        settings: state.settings,
        planLifecycle: state.planLifecycle,
        pause: state.pause,
        skip: state.skip,
        breakSession: state.breakSession,
        capability: state.capability,
        guidanceIndex: state.guidanceIndex
    });
}

function reconcileEffects(state, facts, extraEvents) {
    const desiredResult = buildDesiredPlan(state, facts);
    if (desiredResult.tag === 'Err') {
        return desiredResult;
    }
    let desired = desiredResult.value;
    const strategyResult = chooseSchedulingStrategy(state.capability, desired);
    if (strategyResult.tag === 'Ok') {
        desired = applyStrategyWindow(desired, strategyResult.value);
    }
    const registered = facts.registeredPlan || emptyPlan();
    const diff = diffPlans(desired, registered);
    const events = (extraEvents || []).concat([planReconciled(diff)]);
    const effects = [
        persistSnapshot(snapshotFrom(Object.assign({}, state, {
            revision: state.revision + events.length
        }))),
        cancelReminders(diff.toCancel),
        registerReminders(diff.toRegister)
    ];
    return ok(decision(events, effects));
}

function requireFacts(facts) {
    if (!facts || !facts.now || !facts.localWall) {
        return err(domainError(ERROR_CODES.INVALID_INSTANT, facts));
    }
    return ok(facts);
}

/**
 * decide : DomainState × Command × Facts -> Result<DomainError, Decision>
 * Pure. No ports, no clock, no storage.
 */
export function decide(state, command, facts) {
    if (!command || typeof command.tag !== 'string') {
        return err(domainError(ERROR_CODES.UNKNOWN_COMMAND, command));
    }
    const factsCheck = requireFacts(facts);
    if (factsCheck.tag === 'Err' && command.tag !== 'ConfigureSchedule' &&
        command.tag !== 'ObserveCapability') {
        // ConfigureSchedule and ObserveCapability can work with partial facts
        if (command.tag !== 'ConfigureSchedule' && command.tag !== 'ObserveCapability') {
            return factsCheck;
        }
    }

    switch (command.tag) {
        case 'ConfigureSchedule': {
            const parsed = typeof command.input.tag === 'string' && command.input.tag === 'ScheduleSettings'
                ? ok(command.input)
                : parseScheduleInput(command.input);
            if (parsed.tag === 'Err') {
                return parsed;
            }
            const events = [scheduleConfigured(parsed.value)];
            const nextSettings = parsed.value;
            const provisional = Object.assign({}, state, { settings: nextSettings });
            if (state.planLifecycle.tag === 'Enabled' || state.planLifecycle.tag === 'Paused') {
                const recon = reconcileEffects(provisional, facts, events);
                if (recon.tag === 'Err') {
                    return recon;
                }
                return recon;
            }
            return ok(decision(events, [persistSnapshot(snapshotFrom(Object.assign({}, state, {
                settings: nextSettings,
                revision: state.revision + 1
            })))]));
        }

        case 'EnablePlan': {
            const capabilityCheck = assertCanEnableReliable(state.capability);
            if (capabilityCheck.tag === 'Err') {
                return ok(decision([
                    event('PlanBlocked', { error: capabilityCheck.error })
                ], [
                    emitDiagnostic({
                        tag: 'CapabilityBlocked',
                        code: capabilityCheck.error.code,
                        at: facts && facts.now
                    })
                ]));
            }
            if (state.planLifecycle.tag === 'Enabled') {
                // Idempotent enable
                return reconcileEffects(state, facts, []);
            }
            const events = [
                event('PlanEnableRequested'),
                planEnabled()
            ];
            const provisional = Object.assign({}, state, {
                planLifecycle: { tag: 'Enabled' },
                settings: Object.freeze(Object.assign({}, state.settings, { enabledFlag: true }))
            });
            return reconcileEffects(provisional, facts, events);
        }

        case 'DisablePlan': {
            if (state.planLifecycle.tag === 'Disabled') {
                return ok(decision([], []));
            }
            const registered = facts.registeredPlan || emptyPlan();
            const keys = registered.map(function (intent) {
                return intent.key.value;
            });
            return ok(decision([planDisabled()], [
                cancelReminders(keys),
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    planLifecycle: { tag: 'Disabled' },
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'PauseUntil':
        case 'PauseForToday': {
            const until = command.instant || command.until;
            if (!until || until.tag !== 'Instant') {
                return err(domainError(ERROR_CODES.INVALID_INSTANT, until));
            }
            const localResult = instantToLocal(until, facts.utcOffsetMinutes || 0);
            if (localResult.tag === 'Err') {
                return localResult;
            }
            const local = localResult.value;
            const pause = pauseThroughLocal(local.localDate, local.minuteOfDay);
            const events = [
                planPaused(until),
                event('PauseLocalSet', {
                    localDate: local.localDate,
                    minuteOfDay: local.minuteOfDay
                })
            ];
            // planPaused evolve expects until; also set pause via PauseLocalSet
            // Fix planPaused event to include pause for evolve
            events[0] = event('PlanPaused', { until: until, pause: pause });
            const provisional = Object.assign({}, state, {
                planLifecycle: { tag: 'Paused', until: until },
                pause: pause
            });
            return reconcileEffects(provisional, facts, events);
        }

        case 'PauseForOneHour': {
            const now = command.now || (facts && facts.now);
            if (!now || now.tag !== 'Instant') {
                return err(domainError(ERROR_CODES.INVALID_INSTANT, now));
            }
            const untilResult = instant(now.epochMilliseconds + ONE_HOUR_MS);
            if (untilResult.tag === 'Err') {
                return untilResult;
            }
            return decide(state, {
                tag: 'PauseUntil',
                instant: untilResult.value
            }, facts);
        }

        case 'SkipNext': {
            const desiredResult = buildDesiredPlan(state, facts);
            if (desiredResult.tag === 'Err') {
                return desiredResult;
            }
            // Skip applies to unsuppressed plan without current skip
            const datesResult = enumerateDates(facts.localWall.localDate, facts.horizonDays || DEFAULT_HORIZON_DAYS);
            if (datesResult.tag === 'Err') {
                return datesResult;
            }
            const raw = generateRangePlan(datesResult.value, state.settings);
            const withoutSkip = applySuppression(raw, state.pause || noPause(), noSkip());
            const next = firstFutureIntent(
                withoutSkip,
                facts.localWall.localDate,
                facts.localWall.minuteOfDay
            );
            if (!next) {
                return err(domainError(ERROR_CODES.NOTHING_TO_SKIP, null));
            }
            const events = [nextReminderSkipped(next.key)];
            const provisional = Object.assign({}, state, {
                skip: { tag: 'SkipReminder', reminderKey: next.key }
            });
            return reconcileEffects(provisional, facts, events);
        }

        case 'HandleReminderFired': {
            const keyValue = command.reminderKey && command.reminderKey.value
                ? command.reminderKey.value
                : command.reminderKey;
            const desiredResult = buildDesiredPlan(state, facts);
            if (desiredResult.tag === 'Err') {
                return desiredResult;
            }
            const intent = findIntentByKey(desiredResult.value, keyValue) ||
                findIntentByKey(facts.registeredPlan || [], keyValue);
            if (!intent) {
                return ok(decision([], [
                    emitDiagnostic({
                        tag: 'StaleReminderIgnored',
                        reminderKey: keyValue,
                        at: command.firedAt || facts.now
                    })
                ]));
            }
            const dueAt = command.firedAt || facts.now;
            return ok(decision([
                breakBecameDue(intent.key, dueAt)
            ], [
                vibrate('BreakStart'),
                navigate('break-due'),
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    breakSession: { tag: 'Due' },
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'StartBreak':
        case 'StartBreakNow': {
            const now = facts.now;
            const breakMinutes = state.settings.rhythm.breakMinutes.value;
            const endsAtResult = instant(now.epochMilliseconds + breakMinutes * 60 * 1000);
            if (endsAtResult.tag === 'Err') {
                return endsAtResult;
            }
            const selected = selectNextGuidance(state.guidanceIndex);
            const sessionId = 'break-' + now.epochMilliseconds;
            const reminderKey = command.reminderKey ||
                (state.breakSession.tag === 'Due' ? state.breakSession.reminderKey : undefined);

            if (command.tag === 'StartBreak' && state.breakSession.tag !== 'Due') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }

            const started = breakStarted(
                sessionId,
                now,
                endsAtResult.value,
                selected.guidance.id
            );
            // Attach nextGuidanceIndex for evolve
            const startedEvent = event('BreakStarted', {
                sessionId: sessionId,
                startedAt: now,
                endsAt: endsAtResult.value,
                guidanceId: selected.guidance.id,
                nextGuidanceIndex: selected.nextIndex,
                reminderKey: reminderKey
            });
            void started;
            return ok(decision([startedEvent], [
                vibrate('BreakStart'),
                navigate('break-active'),
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'CompleteBreak': {
            if (state.breakSession.tag !== 'Active') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: 'CompleteBreak'
                })));
            }
            return ok(decision([
                breakFinished(state.breakSession.sessionId, facts.now, completedOutcome())
            ], [
                vibrate('BreakEnd'),
                navigate('home'),
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'SkipBreak': {
            if (state.breakSession.tag !== 'Due' && state.breakSession.tag !== 'Active') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: 'SkipBreak'
                })));
            }
            const sessionId = state.breakSession.sessionId ||
                (state.breakSession.reminderKey && state.breakSession.reminderKey.value) ||
                'skipped';
            return ok(decision([
                event('BreakSkipped', {
                    sessionId: sessionId,
                    finishedAt: facts.now
                })
            ], [
                navigate('home'),
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'AcknowledgeBreakFinished': {
            if (state.breakSession.tag !== 'Finished') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: 'AcknowledgeBreakFinished'
                })));
            }
            return ok(decision([
                event('BreakAcknowledged', { sessionId: state.breakSession.sessionId })
            ], [
                persistSnapshot(snapshotFrom(Object.assign({}, state, {
                    revision: state.revision + 1
                })))
            ]));
        }

        case 'ReconcilePlan': {
            if (state.planLifecycle.tag !== 'Enabled' && state.planLifecycle.tag !== 'Paused' &&
                state.planLifecycle.tag !== 'Enabling') {
                return ok(decision([], []));
            }
            return reconcileEffects(state, facts, []);
        }

        case 'ObserveCapability': {
            return ok(decision([
                capabilityObserved(command.capability)
            ], [
                emitDiagnostic({
                    tag: 'CapabilityObserved',
                    capabilityTag: command.capability && command.capability.tag,
                    at: facts && facts.now
                })
            ]));
        }

        default:
            return err(domainError(ERROR_CODES.UNKNOWN_COMMAND, command.tag));
    }
}

/**
 * Helper for tests and workflows: end-of-day instant from local wall facts.
 */
export function endOfLocalDayInstant(localWall, utcOffsetMinutes) {
    const endMinute = Object.freeze({ tag: 'MinuteOfDay', value: 1439 });
    return localToInstant(localWall.localDate, endMinute, utcOffsetMinutes || 0);
}

export function buildDesiredPlanForState(state, facts) {
    return buildDesiredPlan(state, facts);
}

void skippedOutcome;
