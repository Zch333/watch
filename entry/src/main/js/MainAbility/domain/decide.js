import { enumerateDates, instantToLocal, localToInstant } from './calendar.js';
import { cancelReminders, decision, emitDiagnostic, navigate, registerReminders, vibrate } from './effects.js';
import { domainError, ERROR_CODES } from './errors.js';
import {
    breakAcknowledged,
    breakBecameDue,
    breakFinished,
    breakSkipped,
    breakStarted,
    capabilityObserved,
    nextReminderSkipped,
    planBlocked,
    planDisabled,
    planEnabled,
    planEnableRequested,
    planPaused,
    planReconciled,
    scheduleConfigured
} from './events.js';
import { selectNextGuidance } from './guidance.js';
import { applyStrategyWindow, assertCanEnableReliable, buildRecurrenceRules, chooseSchedulingStrategy } from './policy.js';
import {
    applySuppression,
    attachDueAt,
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
import { parseScheduleInput } from './settings.js';
import { completedOutcome } from './state.js';
import { evolveAll } from './evolve.js';
import { instant } from './values.js';

const DEFAULT_HORIZON_DAYS = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Early-fire tolerance: a reminder callback arriving more than this much
 * BEFORE its scheduled absolute instant is treated as an anomaly (clock/timezone
 * change or duplicate misfire). INFERRED default; calibrate with the GT6 probe.
 */
const EARLY_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Late-fire tolerance: a callback arriving more than this much AFTER its
 * scheduled instant is stale (the work/break slot has moved on; the prompt
 * would be noise). INFERRED default; calibrate with the GT6 probe.
 */
const LATE_TOLERANCE_MS = 15 * 60 * 1000;

function missingFact(facts, name) {
    const value = facts ? facts[name] : undefined;
    if (value === undefined || value === null) {
        return err(domainError(ERROR_CODES.INVALID_INSTANT, Object.freeze({ missing: name })));
    }
    return ok(value);
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
    // Drop past intents for today (dates before today were never generated).
    const future = [];
    for (let index = 0; index < suppressed.length; index += 1) {
        const intent = suppressed[index];
        const wall = facts.localWall;
        const dateOrder = (intent.localDate.year - wall.localDate.year) ||
            (intent.localDate.month - wall.localDate.month) ||
            (intent.localDate.day - wall.localDate.day);
        if (dateOrder > 0 || (dateOrder === 0 && intent.at.value > wall.minuteOfDay.value)) {
            future.push(intent);
        }
    }
    // Resolve each intent to an absolute due instant for fingerprint diffing.
    return attachDueAt(future, facts.utcOffsetMinutes);
}

/**
 * Full suppressed plan without the "future only" filter. Used to validate a
 * reminder firing whose due minute may equal the current wall minute.
 */
function buildSuppressedPlan(state, facts) {
    const horizon = typeof facts.horizonDays === 'number' ? facts.horizonDays : DEFAULT_HORIZON_DAYS;
    const datesResult = enumerateDates(facts.localWall.localDate, horizon);
    if (datesResult.tag === 'Err') {
        return datesResult;
    }
    const rawPlan = generateRangePlan(datesResult.value, state.settings);
    const pause = state.pause || noPause();
    const skip = state.skip || noSkip();
    return attachDueAt(applySuppression(rawPlan, pause, skip), facts.utcOffsetMinutes);
}

function reconcileEffects(state, facts, extraEvents) {
    const desiredResult = buildDesiredPlan(state, facts);
    if (desiredResult.tag === 'Err') {
        return desiredResult;
    }
    let desired = desiredResult.value;
    let strategy;
    const strategyResult = chooseSchedulingStrategy(state.capability, desired);
    if (strategyResult.tag === 'Ok') {
        strategy = strategyResult.value;
        desired = applyStrategyWindow(desired, strategy, facts.now);
    }
    const registered = facts.registeredPlan || emptyPlan();
    const diff = diffPlans(desired, registered);
    const events = (extraEvents || []).concat([planReconciled(diff)]);
    // Events must be evolvable in isolation; the shell persists the final
    // state after it settles lifecycle events against effect results.
    const evolved = evolveAll(state, events);
    if (evolved.tag === 'Err') {
        return evolved;
    }
    const rules = strategy && strategy.tag === 'RecurringCalendarStrategy'
        ? buildRecurrenceRules(desired)
        : undefined;
    const effects = [
        cancelReminders(diff.toCancel),
        registerReminders(diff.toRegister, rules)
    ];
    return ok(decision(events, effects));
}

/**
 * Build a decision for commands that only produce events and effects.
 * Persistence is owned by the imperative shell (it must reflect the final,
 * settled state), so no PersistSnapshot effect is emitted here.
 */
function decideSnapshot(state, events, extraEffects) {
    const evolved = evolveAll(state, events || []);
    if (evolved.tag === 'Err') {
        return evolved;
    }
    return ok(decision(events || [], extraEffects || []));
}

/**
 * decide : DomainState × Command × Facts -> Result<DomainError, Decision>
 * Pure. No ports, no clock, no storage. Facts are values fetched by the shell.
 */
export function decide(state, command, facts) {
    if (!command || typeof command.tag !== 'string') {
        return err(domainError(ERROR_CODES.UNKNOWN_COMMAND, command));
    }
    const factsValue = facts || {};

    switch (command.tag) {
        case 'ConfigureSchedule': {
            const parsed = command.input && command.input.tag === 'ScheduleSettings'
                ? ok(command.input)
                : parseScheduleInput(command.input);
            if (parsed.tag === 'Err') {
                return parsed;
            }
            const provisional = Object.assign({}, state, { settings: parsed.value });
            if (state.planLifecycle.tag === 'Enabled' || state.planLifecycle.tag === 'Paused') {
                const localWallResult = missingFact(factsValue, 'localWall');
                if (localWallResult.tag === 'Err') {
                    return localWallResult;
                }
                return reconcileEffects(provisional, factsValue, [scheduleConfigured(parsed.value)]);
            }
            return decideSnapshot(provisional, [scheduleConfigured(parsed.value)]);
        }

        case 'EnablePlan': {
            const capabilityCheck = assertCanEnableReliable(state.capability);
            if (capabilityCheck.tag === 'Err') {
                return decideSnapshot(state, [planBlocked(capabilityCheck.error)], [
                    emitDiagnostic({
                        tag: 'CapabilityBlocked',
                        code: capabilityCheck.error.code,
                        at: factsValue.now
                    })
                ]);
            }
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            const localWallResult = missingFact(factsValue, 'localWall');
            if (localWallResult.tag === 'Err') {
                return localWallResult;
            }
            if (state.planLifecycle.tag === 'Enabled') {
                // Idempotent enable: still reconcile to converge registered state.
                return reconcileEffects(state, factsValue, []);
            }
            const provisional = Object.assign({}, state, {
                planLifecycle: { tag: 'Enabled' },
                settings: Object.freeze(Object.assign({}, state.settings, { enabledFlag: true }))
            });
            return reconcileEffects(provisional, factsValue, [planEnableRequested(), planEnabled()]);
        }

        case 'DisablePlan': {
            if (state.planLifecycle.tag === 'Disabled') {
                return ok(decision([], []));
            }
            const registered = factsValue.registeredPlan || emptyPlan();
            const keys = registered.map(function (intent) {
                return intent.key.value;
            });
            return decideSnapshot(state, [planDisabled()], [
                cancelReminders(keys)
            ]);
        }

        case 'PauseUntil':
        case 'PauseForToday': {
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            const localWallResult = missingFact(factsValue, 'localWall');
            if (localWallResult.tag === 'Err') {
                return localWallResult;
            }
            const utcOffsetResult = missingFact(factsValue, 'utcOffsetMinutes');
            if (utcOffsetResult.tag === 'Err') {
                return utcOffsetResult;
            }

            let until;
            if (command.tag === 'PauseUntil') {
                if (!command.instant || command.instant.tag !== 'Instant') {
                    return err(domainError(ERROR_CODES.INVALID_INSTANT, command.instant));
                }
                until = command.instant;
            } else {
                const endResult = endOfLocalDayInstant(localWallResult.value, utcOffsetResult.value);
                if (endResult.tag === 'Err') {
                    return endResult;
                }
                until = endResult.value;
            }

            const localResult = instantToLocal(until, utcOffsetResult.value);
            if (localResult.tag === 'Err') {
                return localResult;
            }
            const local = localResult.value;
            const pause = pauseThroughLocal(local.localDate, local.minuteOfDay);
            const provisional = Object.assign({}, state, {
                planLifecycle: { tag: 'Paused', until: until },
                pause: pause
            });
            return reconcileEffects(provisional, factsValue, [planPaused(until, pause)]);
        }

        case 'PauseForOneHour': {
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            const untilResult = instant(nowResult.value.epochMilliseconds + ONE_HOUR_MS);
            if (untilResult.tag === 'Err') {
                return untilResult;
            }
            return decide(state, { tag: 'PauseUntil', instant: untilResult.value }, factsValue);
        }

        case 'SkipNext': {
            const localWallResult = missingFact(factsValue, 'localWall');
            if (localWallResult.tag === 'Err') {
                return localWallResult;
            }
            const datesResult = enumerateDates(
                localWallResult.value.localDate,
                factsValue.horizonDays || DEFAULT_HORIZON_DAYS
            );
            if (datesResult.tag === 'Err') {
                return datesResult;
            }
            const raw = generateRangePlan(datesResult.value, state.settings);
            const withoutSkip = applySuppression(raw, state.pause || noPause(), noSkip());
            const next = firstFutureIntent(
                withoutSkip,
                localWallResult.value.localDate,
                localWallResult.value.minuteOfDay
            );
            if (!next) {
                return err(domainError(ERROR_CODES.NOTHING_TO_SKIP, null));
            }
            const provisional = Object.assign({}, state, {
                skip: { tag: 'SkipReminder', reminderKey: next.key }
            });
            return reconcileEffects(provisional, factsValue, [nextReminderSkipped(next.key)]);
        }

        case 'HandleReminderFired': {
            const keyValue = command.reminderKey && command.reminderKey.value
                ? command.reminderKey.value
                : command.reminderKey;
            if (typeof keyValue !== 'string' || keyValue.length === 0) {
                return err(domainError(ERROR_CODES.INVALID_SEMANTIC_KEY, command.reminderKey));
            }
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            const localWallResult = missingFact(factsValue, 'localWall');
            if (localWallResult.tag === 'Err') {
                return localWallResult;
            }

            // Stale callbacks after disable/block must not pop a break prompt.
            if (state.planLifecycle.tag !== 'Enabled' &&
                state.planLifecycle.tag !== 'Paused' &&
                state.planLifecycle.tag !== 'Enabling') {
                return decideSnapshot(state, [], [
                    emitDiagnostic({
                        tag: 'ReminderIgnoredWhileDisabled',
                        reminderKey: keyValue,
                        at: command.firedAt || factsValue.now
                    })
                ]);
            }

            // Idempotency: one session at a time. A duplicate or overlapping
            // firing while a prompt is pending or a break is running must never
            // clobber the current session.
            if (state.breakSession.tag === 'Due' || state.breakSession.tag === 'Active') {
                return decideSnapshot(state, [], [
                    emitDiagnostic({
                        tag: 'DuplicateReminderIgnored',
                        reminderKey: keyValue,
                        sessionTag: state.breakSession.tag,
                        at: command.firedAt || factsValue.now
                    })
                ]);
            }

            const suppressedResult = buildSuppressedPlan(state, factsValue);
            if (suppressedResult.tag === 'Err') {
                return suppressedResult;
            }
            const intent = findIntentByKey(suppressedResult.value, keyValue);
            if (!intent) {
                return decideSnapshot(state, [], [
                    emitDiagnostic({
                        tag: 'StaleReminderIgnored',
                        reminderKey: keyValue,
                        at: command.firedAt || factsValue.now
                    })
                ]);
            }
            // Anomaly guard: a callback arriving well before its scheduled
            // absolute instant means the clock/timezone moved or a duplicate
            // misfired; surface it instead of silently accepting it.
            if (intent.dueAt && intent.dueAt.tag === 'Instant') {
                const firedInstant = command.firedAt || factsValue.now;
                const delta = firedInstant.epochMilliseconds - intent.dueAt.epochMilliseconds;
                if (delta < -EARLY_TOLERANCE_MS) {
                    return err(domainError(ERROR_CODES.REMINDER_FIRED_TOO_EARLY, Object.freeze({
                        key: keyValue,
                        deltaMilliseconds: delta,
                        toleranceMilliseconds: EARLY_TOLERANCE_MS
                    })));
                }
                if (delta > LATE_TOLERANCE_MS) {
                    return err(domainError(ERROR_CODES.STALE_REMINDER_CALLBACK, Object.freeze({
                        key: keyValue,
                        deltaMilliseconds: delta,
                        toleranceMilliseconds: LATE_TOLERANCE_MS
                    })));
                }
            }
            const dueAt = command.firedAt || factsValue.now;
            return decideSnapshot(state, [breakBecameDue(intent.key, dueAt)], [
                vibrate('BreakStart'),
                navigate('break-due')
            ]);
        }

        case 'StartBreak': {
            if (state.breakSession.tag !== 'Due') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }
            // Acknowledged start: the reminder alert already vibrated when the
            // prompt appeared; vibrating again would double the BreakStart cue.
            return startActiveBreak(state, factsValue, state.breakSession.reminderKey, true);
        }

        case 'StartBreakNow': {
            if (state.breakSession.tag === 'Active') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }
            return startActiveBreak(state, factsValue, undefined, false);
        }

        case 'CompleteBreak': {
            if (state.breakSession.tag !== 'Active') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            return decideSnapshot(state, [
                breakFinished(state.breakSession.sessionId, nowResult.value, completedOutcome())
            ], [
                vibrate('BreakEnd'),
                navigate('home')
            ]);
        }

        case 'SkipBreak': {
            if (state.breakSession.tag !== 'Due' && state.breakSession.tag !== 'Active') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }
            const nowResult = missingFact(factsValue, 'now');
            if (nowResult.tag === 'Err') {
                return nowResult;
            }
            const sessionId = state.breakSession.sessionId ||
                (state.breakSession.reminderKey && state.breakSession.reminderKey.value) ||
                'skipped';
            return decideSnapshot(state, [
                breakSkipped(sessionId, nowResult.value)
            ], [
                navigate('home')
            ]);
        }

        case 'AcknowledgeBreakFinished': {
            if (state.breakSession.tag !== 'Finished') {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    from: state.breakSession.tag,
                    command: command.tag
                })));
            }
            return decideSnapshot(state, [
                breakAcknowledged(state.breakSession.sessionId)
            ]);
        }

        case 'ReconcilePlan': {
            if (state.planLifecycle.tag !== 'Enabled' &&
                state.planLifecycle.tag !== 'Paused' &&
                state.planLifecycle.tag !== 'Enabling') {
                return ok(decision([], []));
            }
            return reconcileEffects(state, factsValue, []);
        }

        case 'ObserveCapability': {
            if (!command.capability || typeof command.capability.tag !== 'string') {
                return err(domainError(ERROR_CODES.CAPABILITY_NOT_CONFIRMED, command.capability));
            }
            return decideSnapshot(state, [capabilityObserved(command.capability)], [
                emitDiagnostic({
                    tag: 'CapabilityObserved',
                    capabilityTag: command.capability.tag,
                    at: factsValue.now
                })
            ]);
        }

        default:
            return err(domainError(ERROR_CODES.UNKNOWN_COMMAND, command.tag));
    }
}

/**
 * Start an active break session. `acknowledged` means the user is answering
 * a prompt that already vibrated (StartBreak from Due): no second BreakStart
 * cue. Self-initiated starts (StartBreakNow) vibrate as immediate feedback.
 */
function startActiveBreak(state, factsValue, reminderKey, acknowledged) {
    const nowResult = missingFact(factsValue, 'now');
    if (nowResult.tag === 'Err') {
        return nowResult;
    }
    const now = nowResult.value;
    const breakMinutes = state.settings.rhythm.breakMinutes.value;
    const endsAtResult = instant(now.epochMilliseconds + breakMinutes * 60 * 1000);
    if (endsAtResult.tag === 'Err') {
        return endsAtResult;
    }
    const selected = selectNextGuidance(state.guidanceIndex);
    const sessionId = 'break-' + now.epochMilliseconds;
    const effects = acknowledged
        ? [navigate('break-active')]
        : [vibrate('BreakStart'), navigate('break-active')];
    return decideSnapshot(state, [
        breakStarted(
            sessionId,
            now,
            endsAtResult.value,
            selected.guidance.id,
            selected.nextIndex
        )
    ], effects);
}

/**
 * End-of-day instant (23:59 local) for "pause today".
 */
export function endOfLocalDayInstant(localWall, utcOffsetMinutes) {
    const endMinute = Object.freeze({ tag: 'MinuteOfDay', value: 1439 });
    return localToInstant(localWall.localDate, endMinute, utcOffsetMinutes);
}

export function buildDesiredPlanForState(state, facts) {
    return buildDesiredPlan(state, facts);
}
