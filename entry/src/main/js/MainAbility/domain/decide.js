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
import {
    applyStrategyWindow,
    assertCanEnableReliable,
    buildRecurrenceRules,
    chooseSchedulingStrategy
} from './policy.js';
import {
    applySuppression,
    attachDueAt,
    diffPlans,
    emptyPlan,
    findIntentByKey,
    firstFutureIntent,
    generateRangePlan,
    LATE_TOLERANCE_MS,
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

function missingFact(facts, name) {
    const value = facts ? facts[name] : undefined;
    if (value === undefined || value === null) {
        return err(domainError(ERROR_CODES.INVALID_INSTANT, Object.freeze({ missing: name })));
    }
    return ok(value);
}

/**
 * The calendar resolver fact: a pure (localDate, minuteOfDay) -> Instant
 * mapping built by the shell from the CalendarPort. When absent (direct
 * domain tests) the fallback resolves every local time with the single
 * explicit utcOffsetMinutes fact — the production shell always passes the
 * resolver so every future date across a DST boundary resolves individually.
 */
function resolveLocalFrom(facts) {
    if (facts && typeof facts.resolveLocal === 'function') {
        return facts.resolveLocal;
    }
    const offset = facts ? facts.utcOffsetMinutes : undefined;
    return function (localDateValue, minuteOfDayValue) {
        return localToInstant(localDateValue, minuteOfDayValue, offset);
    };
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
    // Resolve every intent to an absolute due instant FIRST (per local time,
    // through the calendar resolver), then drop intents whose due instant is
    // already past: registering a past alarm could fire immediately. Late
    // callbacks stay safe through the diffPlans cancel guard instead: a
    // registered reminder inside its late-delivery window is never cancelled
    // (review P1-03), so a 10:25 reminder is not lost to a 10:26 reconcile.
    const attached = attachDueAt(suppressed, resolveLocalFrom(facts));
    if (attached.tag === 'Err') {
        return attached;
    }
    const nowMs = facts.now && facts.now.tag === 'Instant' &&
        typeof facts.now.epochMilliseconds === 'number' && isFinite(facts.now.epochMilliseconds)
        ? facts.now.epochMilliseconds
        : null;
    const future = [];
    for (let index = 0; index < attached.value.length; index += 1) {
        const intent = attached.value[index];
        const dueMs = intent.dueAt.epochMilliseconds;
        if (nowMs === null || dueMs > nowMs) {
            future.push(intent);
        }
    }
    return ok(Object.freeze(future));
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
    return attachDueAt(applySuppression(rawPlan, pause, skip), resolveLocalFrom(facts));
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
    const nowMs = facts.now && facts.now.tag === 'Instant' &&
        typeof facts.now.epochMilliseconds === 'number' && isFinite(facts.now.epochMilliseconds)
        ? facts.now.epochMilliseconds
        : null;
    const diff = diffPlans(desired, registered, nowMs);
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
    if (rules && typeof strategy.maxPendingCount === 'number' &&
        rules.length > strategy.maxPendingCount) {
        // The platform can hold at most maxPendingCount registrations; with
        // recurring registration each weekly rule costs one slot. Folding
        // first and checking rule count here keeps Mon–Fri slots intact
        // instead of silently truncating concrete dates (review P1-06).
        return err(domainError(ERROR_CODES.REMINDER_CAPACITY_EXCEEDED, Object.freeze({
            ruleCount: rules.length,
            capacity: strategy.maxPendingCount
        })));
    }
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
            const registered = factsValue.registeredPlan || emptyPlan();
            const keys = registered.map(function (intent) {
                return intent.key.value;
            });
            if (state.planLifecycle.tag === 'Disabled') {
                if (keys.length === 0) {
                    // State and registry are both off: truly idempotent.
                    return ok(decision([], []));
                }
                // State says Disabled but the system still holds reminders
                // (a previous disable failed to cancel). No new domain event:
                // just clean the orphans; a failed cancel stays retryable.
                return decideSnapshot(state, [], [
                    cancelReminders(keys)
                ]);
            }
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
                // End of the local day, resolved individually through the
                // calendar resolver (a DST switch at midnight would otherwise
                // compute the wrong instant from the current offset).
                const endResult = resolveLocalFrom(factsValue)(
                    localWallResult.value.localDate,
                    Object.freeze({ tag: 'MinuteOfDay', value: 1439 })
                );
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

            // firedAt must be a fully valid Instant, exactly like the shell
            // clock: a malformed-but-truthy firedAt would turn the early/late
            // delta into NaN and could be persisted as a dueAt (P1-04).
            const firedAt = command.firedAt || factsValue.now;
            if (!firedAt ||
                firedAt.tag !== 'Instant' ||
                typeof firedAt.epochMilliseconds !== 'number' ||
                !isFinite(firedAt.epochMilliseconds) ||
                Math.floor(firedAt.epochMilliseconds) !== firedAt.epochMilliseconds) {
                return err(domainError(ERROR_CODES.INVALID_INSTANT, command.firedAt));
            }

            // Stale callbacks after disable/block must not pop a break prompt.
            if (state.planLifecycle.tag !== 'Enabled' &&
                state.planLifecycle.tag !== 'Paused' &&
                state.planLifecycle.tag !== 'Enabling') {
                return decideSnapshot(state, [], [
                    emitDiagnostic({
                        tag: 'ReminderIgnoredWhileDisabled',
                        reminderKey: keyValue,
                        at: firedAt
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
                        at: firedAt
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
                        at: firedAt
                    })
                ]);
            }
            // Anomaly guard: a callback arriving well before its scheduled
            // absolute instant means the clock/timezone moved or a duplicate
            // misfired; surface it instead of silently accepting it.
            if (intent.dueAt && intent.dueAt.tag === 'Instant') {
                const delta = firedAt.epochMilliseconds - intent.dueAt.epochMilliseconds;
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
            return decideSnapshot(state, [breakBecameDue(intent.key, firedAt)], [
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
            // The prompt belongs to exactly one reminder. A stale page, a
            // double tap or a delayed UI event may carry an old key: starting
            // the wrong reminder's session would mislabel the break (P1-05).
            const commandKey = command.reminderKey && command.reminderKey.value
                ? command.reminderKey.value
                : command.reminderKey;
            const expectedKey = state.breakSession.reminderKey &&
                state.breakSession.reminderKey.value
                ? state.breakSession.reminderKey.value
                : state.breakSession.reminderKey;
            if (commandKey !== expectedKey) {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    reason: 'REMINDER_KEY_MISMATCH',
                    expected: expectedKey,
                    actual: commandKey
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
            const active =
                state.planLifecycle.tag === 'Enabled' ||
                state.planLifecycle.tag === 'Paused' ||
                state.planLifecycle.tag === 'Enabling';

            if (!active) {
                // Disabled or Blocked: the system must not hold any Move25
                // reminders. Cancel leftovers without touching domain state,
                // so a previously failed disable can finally converge.
                const registered = factsValue.registeredPlan || emptyPlan();
                const orphanKeys = registered.map(function (intent) {
                    return intent.key.value;
                });
                if (orphanKeys.length === 0) {
                    return ok(decision([], []));
                }
                return decideSnapshot(state, [], [
                    cancelReminders(orphanKeys)
                ]);
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
 * Public projection helper used by the MVU layer: the desired (strictly
 * future) plan for display purposes.
 */
export function buildDesiredPlanForState(state, facts) {
    return buildDesiredPlan(state, facts);
}
