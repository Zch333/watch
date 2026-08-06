import { domainError, ERROR_CODES } from './errors.js';
import { withDomainState } from './model.js';
import { noPause, noSkip, skipReminder } from './plan.js';
import { err, ok } from './result.js';
import {
    breakActiveState,
    breakDueState,
    breakFinishedState,
    expiredOutcome,
    noBreakState,
    planBlockedState,
    planDisabledState,
    planEnabledState,
    planEnablingState,
    planPausedState,
    skippedOutcome
} from './state.js';

function copyState(state, patch) {
    return withDomainState(state, patch);
}

/**
 * evolve : DomainState × DomainEvent -> Result<DomainError, DomainState>
 * Pure state transition on a single domain event.
 */
export function evolve(state, event) {
    if (!event || typeof event.tag !== 'string') {
        return err(domainError(ERROR_CODES.UNKNOWN_EVENT, event));
    }

    switch (event.tag) {
        case 'ScheduleConfigured':
            return ok(copyState(state, {
                settings: event.settings,
                revision: state.revision + 1
            }));

        case 'PlanEnableRequested':
            return ok(copyState(state, {
                planLifecycle: planEnablingState(),
                revision: state.revision + 1
            }));

        case 'PlanEnabled':
            return ok(copyState(state, {
                planLifecycle: planEnabledState(),
                settings: Object.freeze(Object.assign({}, state.settings, { enabledFlag: true })),
                revision: state.revision + 1
            }));

        case 'PlanDisabled':
            return ok(copyState(state, {
                planLifecycle: planDisabledState(),
                settings: Object.freeze(Object.assign({}, state.settings, { enabledFlag: false })),
                pause: noPause(),
                skip: noSkip(),
                revision: state.revision + 1
            }));

        case 'PlanPaused':
            return ok(copyState(state, {
                planLifecycle: planPausedState(event.until),
                pause: event.pause || state.pause,
                revision: state.revision + 1
            }));

        case 'PlanResumed':
            return ok(copyState(state, {
                planLifecycle: planEnabledState(),
                pause: noPause(),
                revision: state.revision + 1
            }));

        case 'PlanBlocked':
            return ok(copyState(state, {
                planLifecycle: planBlockedState(event.error),
                revision: state.revision + 1
            }));

        case 'NextReminderSkipped':
            return ok(copyState(state, {
                skip: skipReminder(event.reminderKey),
                revision: state.revision + 1
            }));

        case 'SuppressionCleared':
            return ok(copyState(state, {
                pause: noPause(),
                skip: noSkip(),
                revision: state.revision + 1
            }));

        case 'BreakBecameDue':
            return ok(copyState(state, {
                breakSession: breakDueState(event.reminderKey, event.dueAt),
                revision: state.revision + 1
            }));

        case 'BreakStarted':
            return ok(copyState(state, {
                breakSession: breakActiveState(
                    event.sessionId,
                    event.startedAt,
                    event.endsAt,
                    event.guidanceId
                ),
                guidanceIndex: typeof event.nextGuidanceIndex === 'number'
                    ? event.nextGuidanceIndex
                    : state.guidanceIndex,
                skip: noSkip(),
                revision: state.revision + 1
            }));

        case 'BreakFinished':
            return ok(copyState(state, {
                breakSession: breakFinishedState(
                    event.sessionId,
                    event.finishedAt,
                    event.outcome
                ),
                revision: state.revision + 1
            }));

        case 'BreakSkipped':
            return ok(copyState(state, {
                breakSession: breakFinishedState(
                    event.sessionId,
                    event.finishedAt,
                    skippedOutcome()
                ),
                revision: state.revision + 1
            }));

        case 'BreakAcknowledged':
            return ok(copyState(state, {
                breakSession: noBreakState(),
                revision: state.revision + 1
            }));

        case 'PlanReconciled':
            return ok(copyState(state, {
                lastReconcileDiff: event.diff,
                revision: state.revision + 1
            }));

        case 'CapabilityObserved':
            return ok(copyState(state, {
                capability: event.capability,
                revision: state.revision + 1
            }));

        default:
            return err(domainError(ERROR_CODES.UNKNOWN_EVENT, event.tag));
    }
}

export function evolveAll(state, events) {
    let current = state;
    const list = events || [];
    for (let index = 0; index < list.length; index += 1) {
        const result = evolve(current, list[index]);
        if (result.tag === 'Err') {
            return result;
        }
        current = result.value;
    }
    return ok(current);
}

/**
 * Startup reduction: expire finished active sessions and past pauses using
 * absolute time facts. Pure: `now` is provided, never read.
 */
export function reduceTemporalState(state, now) {
    const events = [];
    const session = state.breakSession;

    if (session && session.tag === 'Active' &&
        now.epochMilliseconds >= session.endsAt.epochMilliseconds) {
        events.push(Object.freeze({
            tag: 'BreakFinished',
            sessionId: session.sessionId,
            finishedAt: now,
            outcome: expiredOutcome()
        }));
    }

    if (state.planLifecycle && state.planLifecycle.tag === 'Paused' &&
        state.planLifecycle.until &&
        now.epochMilliseconds >= state.planLifecycle.until.epochMilliseconds) {
        events.push(Object.freeze({ tag: 'PlanResumed' }));
    }

    if (events.length === 0) {
        return ok(state);
    }
    return evolveAll(state, events);
}
