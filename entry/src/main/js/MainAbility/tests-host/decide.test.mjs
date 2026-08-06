import assert from 'node:assert/strict';
import test from 'node:test';

import { localToInstant } from '../domain/calendar.js';
import {
    acknowledgeBreakFinished,
    completeBreak,
    disablePlan,
    enablePlan,
    handleReminderFired,
    observeCapability,
    pauseForOneHour,
    pauseForToday,
    reconcilePlan,
    skipBreak,
    skipNext,
    startBreak,
    startBreakNow
} from '../domain/commands.js';
import { decide } from '../domain/decide.js';
import {
    capabilityObserved,
    breakBecameDue
} from '../domain/events.js';
import { evolveAll, reduceTemporalState } from '../domain/evolve.js';
import { initialDomainState } from '../domain/model.js';
import { buildDesiredPlanForState } from '../domain/decide.js';
import { createSnapshot } from '../domain/snapshot.js';
import { diffPlans } from '../domain/plan.js';
import { localDate, minuteOfDay } from '../domain/values.js';
import { capabilitySupported, breakActiveState } from '../domain/state.js';
import { instant } from '../domain/values.js';

const OFFSET = 480; // UTC+8
const SUPPORTED = capabilitySupported({
    maxPendingCount: 30,
    supportsExactTimer: true,
    supportsCalendar: true,
    supportsRecurring: true,
    survivesAppExit: true,
    survivesPhoneDisconnect: true,
    survivesReboot: false
});

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function minute(value) {
    const result = minuteOfDay(value);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function wall(nowInstant, y, m, d, minuteValue) {
    return {
        now: nowInstant,
        localWall: {
            localDate: date(y, m, d),
            minuteOfDay: minute(minuteValue)
        },
        utcOffsetMinutes: OFFSET,
        registeredPlan: [],
        horizonDays: 3
    };
}

function factsAt(y, m, d, minuteValue, extra) {
    const now = localToInstant(date(y, m, d), minute(minuteValue), OFFSET);
    assert.equal(now.tag, 'Ok');
    return Object.assign(wall(now.value, y, m, d, minuteValue), extra || {});
}

function registerIntents(decisionResult) {
    const effect = decisionResult.value.effects.find(function (e) {
        return e.tag === 'RegisterReminders';
    });
    return effect ? effect.intents : [];
}

function cancelKeys(decisionResult) {
    const effect = decisionResult.value.effects.find(function (e) {
        return e.tag === 'CancelReminders';
    });
    return effect ? effect.keys : [];
}

function evolveOk(state, events) {
    const result = evolveAll(state, events);
    assert.equal(result.tag, 'Ok', 'evolve failed: ' + (result.error && result.error.code));
    return result.value;
}

function enabledStateAt(y, m, d, minuteValue, capability) {
    let state = initialDomainState();
    state = evolveOk(state, [capabilityObserved(capability || SUPPORTED)]);
    const enable = decide(state, enablePlan(), factsAt(y, m, d, minuteValue));
    assert.equal(enable.tag, 'Ok');
    return evolveOk(state, enable.value.events);
}

test('example: enable requires a confirmed capability and blocks otherwise', () => {
    const state = initialDomainState();
    const result = decide(state, enablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'PlanBlocked');
    assert.equal(registerIntents(result).length, 0);
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'EmitDiagnostic';
    }), true);
});

test('example: observing a supported capability then enabling registers a bounded plan', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    assert.equal(state.planLifecycle.tag, 'Enabled');
    assert.equal(state.settings.enabledFlag, true);

    const intents = buildDesiredPlanForState(state, factsAt(2026, 8, 6, 600));
    assert.equal(intents.tag, 'Ok');
    assert.equal(intents.value.length > 0, true);
    assert.equal(intents.value[0].key.value, 'break-start:25-5:2026-08-06:625');
    // No drift within a single day: same-cycle gaps are exactly one cycle (30),
    // and the lunch boundary is a positive multiple of the cycle.
    for (let index = 1; index < intents.value.length; index += 1) {
        const previous = intents.value[index - 1];
        const current = intents.value[index];
        if (previous.localDate.year === current.localDate.year &&
            previous.localDate.month === current.localDate.month &&
            previous.localDate.day === current.localDate.day) {
            const gap = current.at.value - previous.at.value;
            assert.equal(gap > 0 && gap % 30 === 0, true,
                'unexpected gap ' + gap + ' at ' + previous.at.value);
        }
    }
    // Weekends (Sat 08-08) must not appear
    assert.equal(intents.value.some(function (intent) {
        return intent.localDate.day === 8 && intent.localDate.month === 8;
    }), false);
});

test('example: the registration decision carries a PlanReconciled diff and effects', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, reconcilePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[result.value.events.length - 1].tag, 'PlanReconciled');
    assert.equal(registerIntents(result).length > 0, true);
    assert.equal(cancelKeys(result).length, 0);
});

test('property: reconcile converges to an empty diff after applying its own effects', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const first = decide(state, reconcilePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(first.tag, 'Ok');
    const registered = registerIntents(first);
    const second = decide(state, reconcilePlan(), factsAt(2026, 8, 6, 600, {
        registeredPlan: registered
    }));
    assert.equal(second.tag, 'Ok');
    const diff = second.value.events[second.value.events.length - 1].diff;
    assert.deepEqual(diff.toRegister, []);
    assert.deepEqual(diff.toCancel, []);
    assert.equal(diff.unchanged.length, registered.length);
});

test('example: enable is idempotent when already enabled', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const again = decide(state, enablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(again.tag, 'Ok');
    assert.equal(again.value.events.some(function (e) {
        return e.tag === 'PlanEnableRequested';
    }), false);
    assert.equal(again.value.events.some(function (e) {
        return e.tag === 'PlanEnabled';
    }), false);
});

test('example: skip next removes exactly the first future intent', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, skipNext(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'NextReminderSkipped');
    assert.equal(result.value.events[0].reminderKey.value, 'break-start:25-5:2026-08-06:625');

    const applied = evolveOk(state, result.value.events);
    assert.equal(applied.skip.tag, 'SkipReminder');
    const desired = buildDesiredPlanForState(applied, factsAt(2026, 8, 6, 600));
    assert.equal(desired.tag, 'Ok');
    assert.equal(desired.value.some(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-08-06:625';
    }), false);

    // When the skipped intent was already registered, reconcile cancels it.
    const withRegistration = decide(state, skipNext(), factsAt(2026, 8, 6, 600, {
        registeredPlan: [{ key: { tag: 'SemanticKey', value: 'break-start:25-5:2026-08-06:625' } }]
    }));
    assert.equal(withRegistration.tag, 'Ok');
    assert.equal(cancelKeys(withRegistration).includes('break-start:25-5:2026-08-06:625'), true);
});

test('example: skipping with no future reminder returns NOTHING_TO_SKIP', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    // Pause beyond the whole horizon (until 2026-08-11 09:00), then try to skip.
    const farFuture = instant(instantToMs(2026, 8, 11, 540)).value;
    const paused = decide(state, { tag: 'PauseUntil', instant: farFuture }, factsAt(2026, 8, 6, 600));
    assert.equal(paused.tag, 'Ok');
    state = evolveOk(state, paused.value.events);
    const result = decide(state, skipNext(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'NOTHING_TO_SKIP');
});

test('example: pause today suppresses the rest of the day', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, pauseForToday(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'PlanPaused');
    assert.equal(result.value.events[0].pause.tag, 'PauseThroughLocal');
    assert.equal(result.value.events[0].pause.minuteOfDay.value, 1439);

    const applied = evolveOk(state, result.value.events);
    assert.equal(applied.planLifecycle.tag, 'Paused');
    const desired = buildDesiredPlanForState(applied, factsAt(2026, 8, 6, 600));
    assert.equal(desired.tag, 'Ok');
    assert.equal(desired.value.some(function (intent) {
        return intent.localDate.day === 6 && intent.localDate.month === 8;
    }), false);
});

function instantToMs(y, m, d, minuteValue) {
    return localToInstant(date(y, m, d), minute(minuteValue), OFFSET).value.epochMilliseconds;
}

test('example: pause for one hour extends until now + 60 minutes', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const now = factsAt(2026, 8, 6, 600).now;
    const result = decide(state, pauseForOneHour(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'PlanPaused');
    const until = result.value.events[0].until;
    assert.equal(until.epochMilliseconds, now.epochMilliseconds + 60 * 60000);
    assert.equal(result.value.events[0].pause.minuteOfDay.value, 660);
});

test('example: expired pause resumes automatically on reduction', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const paused = decide(state, pauseForOneHour(), factsAt(2026, 8, 6, 600));
    assert.equal(paused.tag, 'Ok');
    state = evolveOk(state, paused.value.events);
    assert.equal(state.planLifecycle.tag, 'Paused');

    // 10:00 + 61 minutes = 11:01 local
    const later = factsAt(2026, 8, 6, 661).now;
    const reduced = reduceTemporalState(state, later);
    assert.equal(reduced.tag, 'Ok');
    assert.equal(reduced.value.planLifecycle.tag, 'Enabled');
    assert.equal(reduced.value.pause.tag, 'NoPause');
});

test('example: a valid reminder firing becomes due with vibrate and navigation', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-06:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'BreakBecameDue');
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'Vibrate' && e.pattern === 'BreakStart';
    }), true);
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'Navigate' && e.route === 'break-due';
    }), true);

    const applied = evolveOk(state, result.value.events);
    assert.equal(applied.breakSession.tag, 'Due');
});

test('example: a stale firing is ignored with only a diagnostic', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-09:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events.length, 0);
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'EmitDiagnostic';
    }), true);
});

test('example: a firing arriving after disable is ignored', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const disabled = decide(state, disablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(disabled.tag, 'Ok');
    state = evolveOk(state, disabled.value.events);
    assert.equal(state.planLifecycle.tag, 'Disabled');

    // A stale callback for a key that used to be in the plan must not pop a prompt.
    const fired = factsAt(2026, 8, 6, 625);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-06:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events.length, 0);
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'EmitDiagnostic';
    }), true);
    const kept = evolveOk(state, result.value.events);
    assert.equal(kept.breakSession.tag, 'NoBreak');
});

test('example: a duplicate firing while due is idempotent', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    assert.equal(due.tag, 'Ok');
    state = evolveOk(state, due.value.events);
    assert.equal(state.breakSession.tag, 'Due');

    const dup = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), factsAt(2026, 8, 6, 626));
    assert.equal(dup.tag, 'Ok');
    assert.equal(dup.value.events.length, 0);
    assert.equal(dup.value.effects.some(function (e) {
        return e.tag === 'EmitDiagnostic';
    }), true);
    const kept = evolveOk(state, dup.value.events);
    assert.equal(kept.breakSession.tag, 'Due');
    assert.equal(kept.breakSession.reminderKey.value, 'break-start:25-5:2026-08-06:625');
});

test('example: a duplicate firing never clobbers an active break session', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);
    const started = decide(state, startBreak('break-start:25-5:2026-08-06:625'), factsAt(2026, 8, 6, 625));
    state = evolveOk(state, started.value.events);
    assert.equal(state.breakSession.tag, 'Active');
    const sessionId = state.breakSession.sessionId;
    const endsAt = state.breakSession.endsAt.epochMilliseconds;

    // System redelivers the same callback mid-break: the Active session must survive.
    const dup = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), factsAt(2026, 8, 6, 626));
    assert.equal(dup.tag, 'Ok');
    assert.equal(dup.value.events.length, 0);
    const kept = evolveOk(state, dup.value.events);
    assert.equal(kept.breakSession.tag, 'Active');
    assert.equal(kept.breakSession.sessionId, sessionId);
    assert.equal(kept.breakSession.endsAt.epochMilliseconds, endsAt);
});

test('example: a firing for another key while a session is pending is ignored', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);

    const second = decide(state, handleReminderFired('break-start:25-5:2026-08-06:655', fired.now), factsAt(2026, 8, 6, 626));
    assert.equal(second.tag, 'Ok');
    assert.equal(second.value.events.length, 0);
    const kept = evolveOk(state, second.value.events);
    assert.equal(kept.breakSession.tag, 'Due');
    assert.equal(kept.breakSession.reminderKey.value, 'break-start:25-5:2026-08-06:625');
});

test('example: a later firing supersedes a finished session', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);
    const started = decide(state, startBreak('break-start:25-5:2026-08-06:625'), factsAt(2026, 8, 6, 625));
    state = evolveOk(state, started.value.events);
    state = evolveOk(state, [{
        tag: 'BreakFinished',
        sessionId: state.breakSession.sessionId,
        finishedAt: factsAt(2026, 8, 6, 630).now,
        outcome: { tag: 'Completed' }
    }]);
    assert.equal(state.breakSession.tag, 'Finished');

    // The next cycle's reminder (10:55) fires while the previous outcome is
    // still on screen: the new prompt supersedes the finished session.
    const at655 = factsAt(2026, 8, 6, 655);
    const next = decide(state, handleReminderFired('break-start:25-5:2026-08-06:655', at655.now), at655);
    assert.equal(next.tag, 'Ok');
    assert.equal(next.value.events[0].tag, 'BreakBecameDue');
    const kept = evolveOk(state, next.value.events);
    assert.equal(kept.breakSession.tag, 'Due');
    assert.equal(kept.breakSession.reminderKey.value, 'break-start:25-5:2026-08-06:655');
});

test('example: a delayed callback within the same day still becomes due', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // Reminder scheduled for 10:25, delivered late at 10:40 while the app was
    // backgrounded: the key is still part of the suppressed plan, so it is due.
    const fired = factsAt(2026, 8, 6, 640);
    const result = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'BreakBecameDue');
    const kept = evolveOk(state, result.value.events);
    assert.equal(kept.breakSession.tag, 'Due');
});

test('example: the same instant in another timezone projects a different plan', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // Wall 10:00 UTC+8 is 02:00 UTC on the same day. The shell feeds facts
    // derived from the current offset, so the desired plan starts at 09:25 UTC.
    const now = factsAt(2026, 8, 6, 600).now;
    const desired = buildDesiredPlanForState(state, {
        now: now,
        localWall: { localDate: date(2026, 8, 6), minuteOfDay: minute(120) },
        utcOffsetMinutes: 0,
        registeredPlan: [],
        horizonDays: 3
    });
    assert.equal(desired.tag, 'Ok');
    assert.equal(desired.value[0].key.value, 'break-start:25-5:2026-08-06:565');
});

test('example: a timezone change re-registers reminders at the new absolute times', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const atPlus8 = buildDesiredPlanForState(state, factsAt(2026, 8, 6, 600));
    assert.equal(atPlus8.tag, 'Ok');
    const key = atPlus8.value[0].key.value;
    const duePlus8 = atPlus8.value[0].dueAt.epochMilliseconds;

    // The device moves from UTC+8 to UTC+9 at the SAME instant (02:00 UTC),
    // so the wall clock reads 11:00. Facts stay consistent: localWall is
    // derived from now through the calendar, never mixed offsets.
    const now = factsAt(2026, 8, 6, 600).now;
    const atPlus9 = buildDesiredPlanForState(state, {
        now: now,
        localWall: { localDate: date(2026, 8, 6), minuteOfDay: minute(660) },
        utcOffsetMinutes: 540,
        registeredPlan: [],
        horizonDays: 3
    });
    assert.equal(atPlus9.tag, 'Ok');
    // The first future reminder at UTC+9 is 11:25 local, which occupies the
    // same absolute instant the old 10:25 reminder had at UTC+8.
    assert.equal(atPlus9.value[0].key.value, 'break-start:25-5:2026-08-06:685');
    assert.equal(atPlus9.value[0].dueAt.epochMilliseconds, duePlus8);
    // The old local key no longer exists in the UTC+9 plan (its moment passed).
    assert.equal(atPlus9.value.some(function (intent) {
        return intent.key.value === key;
    }), false);

    // The diff must reschedule: cancel the old key, register the new one.
    const diff = diffPlans(atPlus9.value, atPlus8.value);
    assert.equal(diff.toCancel.indexOf(key) >= 0, true);
    assert.equal(diff.toRegister.some(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-08-06:685';
    }), true);
    assert.equal(diff.unchanged.length, 0);
});

test('example: a callback arriving before its scheduled time is rejected', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // Scheduled at 10:25, delivered at 10:00 (25 minutes early, beyond the
    // INFERRED 5-minute tolerance): clock/timezone moved or a misfire.
    const fired = factsAt(2026, 8, 6, 600);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-06:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'REMINDER_FIRED_TOO_EARLY');
});

test('example: a callback beyond the late tolerance is stale and rejected', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // Scheduled at 10:25, delivered at 10:45 (20 minutes late, beyond the
    // INFERRED 15-minute tolerance): the slot has moved on, the prompt
    // would be noise.
    const fired = factsAt(2026, 8, 6, 645);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-06:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'STALE_REMINDER_CALLBACK');
    assert.equal(result.error.details.deltaMilliseconds, 20 * 60000);
});

test('example: a malformed firedAt is rejected instead of poisoning the delta', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    // truthy but structurally broken firedAt (e.g. a raw platform payload):
    // NaN deltas would silently disable the early/late guards.
    const result = decide(state, {
        tag: 'HandleReminderFired',
        reminderKey: 'break-start:25-5:2026-08-06:625',
        firedAt: { tag: 'Instant', epochMilliseconds: Number.NaN }
    }, fired);
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'INVALID_INSTANT');

    const float = decide(state, {
        tag: 'HandleReminderFired',
        reminderKey: 'break-start:25-5:2026-08-06:625',
        firedAt: { tag: 'Instant', epochMilliseconds: 1.5 }
    }, fired);
    assert.equal(float.tag, 'Err');
    assert.equal(float.error.code, 'INVALID_INSTANT');
});

test('example: start break with a stale reminder key is rejected', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);
    assert.equal(state.breakSession.tag, 'Due');

    // A delayed UI event from an older prompt carries a different key.
    const stale = decide(state, startBreak('break-start:25-5:2026-08-06:655'), factsAt(2026, 8, 6, 625));
    assert.equal(stale.tag, 'Err');
    assert.equal(stale.error.code, 'INVALID_STATE_TRANSITION');
    assert.equal(stale.error.details.reason, 'REMINDER_KEY_MISMATCH');
    assert.equal(stale.error.details.expected, 'break-start:25-5:2026-08-06:625');

    // The matching key still starts the break.
    const ok = decide(state, startBreak('break-start:25-5:2026-08-06:625'), factsAt(2026, 8, 6, 625));
    assert.equal(ok.tag, 'Ok');
});

test('example: recurring strategy fails explicitly when rule count exceeds capacity', () => {
    // maxPendingCount 2 with a Mon–Fri schedule folds into 15 weekly rules
    // (6 morning slots + 9 afternoon slots): truncating the concrete plan to
    // 2 would silently lose weekdays, so the reconcile must fail explicitly
    // instead (review P1-06).
    let state = initialDomainState();
    const small = capabilitySupported({
        maxPendingCount: 2,
        supportsCalendar: true,
        supportsRecurring: true
    });
    state = evolveOk(state, [capabilityObserved(small)]);
    const result = decide(state, enablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'REMINDER_CAPACITY_EXCEEDED');
    assert.equal(result.error.details.ruleCount, 15);
    assert.equal(result.error.details.capacity, 2);
});

test('example: a per-date resolver resolves each intent across a DST boundary', () => {
    // Mon 2026-10-19 -> Tue 2026-10-20 (both weekdays): the offset switches
    // at the boundary, exactly like a DST transition.
    const state = enabledStateAt(2026, 10, 19, 600);
    const SWITCH_DATE = { year: 2026, month: 10, day: 20 };
    const facts = factsAt(2026, 10, 19, 600, {
        resolveLocal: function (localDateValue, minuteOfDayValue) {
            const after = localDateValue.year > SWITCH_DATE.year ||
                (localDateValue.year === SWITCH_DATE.year &&
                    (localDateValue.month > SWITCH_DATE.month ||
                        (localDateValue.month === SWITCH_DATE.month &&
                            localDateValue.day >= SWITCH_DATE.day)));
            return localToInstant(localDateValue, minuteOfDayValue, after ? 540 : 480);
        }
    });
    const desired = buildDesiredPlanForState(state, facts);
    assert.equal(desired.tag, 'Ok');

    const before = desired.value.find(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-10-19:625';
    });
    const after = desired.value.find(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-10-20:625';
    });
    assert.equal(!!before, true);
    assert.equal(!!after, true);
    // Each local time resolves individually: before the switch at UTC+8,
    // after it at UTC+9.
    assert.equal(before.dueAt.epochMilliseconds,
        localToInstant(date(2026, 10, 19), minute(625), 480).value.epochMilliseconds);
    assert.equal(after.dueAt.epochMilliseconds,
        localToInstant(date(2026, 10, 20), minute(625), 540).value.epochMilliseconds);
    // The same local minute across the boundary: one calendar day apart in
    // wall time, but the absolute spread is 23h — one hour less than 24h
    // because the DST switch shifted the offset. A single current offset
    // would have produced a 24h spread (review P1-01).
    assert.equal(after.dueAt.epochMilliseconds - before.dueAt.epochMilliseconds,
        23 * 60 * 60000);
});

test('example: a recurring-capable registration carries weekly recurrence rules', () => {
    // SUPPORTED declares supportsRecurring + supportsCalendar, so the chosen
    // strategy is RecurringCalendar: the effect carries both concrete intents
    // and the weekly rules an adapter can register once per slot.
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, enablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    const effect = result.value.effects.find(function (e) {
        return e.tag === 'RegisterReminders';
    });
    assert.equal(!!effect, true);
    assert.equal(Array.isArray(effect.recurrenceRules), true);
    assert.equal(effect.recurrenceRules.length > 0, true);
    const rule = effect.recurrenceRules[0];
    assert.equal(rule.tag, 'RecurrenceRule');
    assert.equal(rule.repeatKind, 'Weekly');
    assert.equal(rule.weekdays.length > 0, true);
    assert.equal(typeof rule.minuteOfDay, 'number');
});

test('example: a callback slightly early stays within tolerance and becomes due', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // Scheduled at 10:25, delivered at 10:23 (2 minutes early).
    const fired = factsAt(2026, 8, 6, 623);
    const result = decide(
        state,
        handleReminderFired('break-start:25-5:2026-08-06:625', fired.now),
        fired
    );
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'BreakBecameDue');
});

test('example: start break from due creates an active session ending at +5 minutes', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);
    const startResult = decide(state, startBreak('break-start:25-5:2026-08-06:625'), factsAt(2026, 8, 6, 625));
    assert.equal(startResult.tag, 'Ok');
    const startedEvent = startResult.value.events[0];
    assert.equal(startedEvent.tag, 'BreakStarted');
    assert.equal(startedEvent.endsAt.epochMilliseconds - startedEvent.startedAt.epochMilliseconds, 5 * 60000);

    const applied = evolveOk(state, startResult.value.events);
    assert.equal(applied.breakSession.tag, 'Active');
    assert.equal(applied.breakSession.guidanceId, 'stand-walk-eyes');
    assert.equal(applied.guidanceIndex, 1);
    assert.equal(applied.skip.tag, 'NoSkip');
});

test('example: acknowledging a due prompt does not vibrate a second time', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const fired = factsAt(2026, 8, 6, 625);
    // The reminder alert itself vibrates once.
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    assert.equal(due.value.effects.some(function (e) {
        return e.tag === 'Vibrate' && e.pattern === 'BreakStart';
    }), true);
    state = evolveOk(state, due.value.events);

    // Tapping start on the prompt is an acknowledgment: no second cue.
    const start = decide(state, startBreak('break-start:25-5:2026-08-06:625'), factsAt(2026, 8, 6, 625));
    assert.equal(start.tag, 'Ok');
    assert.equal(start.value.effects.some(function (e) {
        return e.tag === 'Vibrate';
    }), false);
    assert.equal(start.value.effects.some(function (e) {
        return e.tag === 'Navigate' && e.route === 'break-active';
    }), true);
});

test('example: starting a break now from home vibrates once as immediate feedback', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, startBreakNow(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'Vibrate' && e.pattern === 'BreakStart';
    }), true);
    assert.equal(result.value.effects.some(function (e) {
        return e.tag === 'Navigate' && e.route === 'break-active';
    }), true);
});

test('example: guidance rotates deterministically across sessions', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const seen = [];
    for (let index = 0; index < 5; index += 1) {
        const now = instant(600 * 60000 + index * 60000).value;
        const dueEvent = breakBecameDue({ tag: 'SemanticKey', value: 'k-' + index }, now);
        state = evolveOk(state, [dueEvent]);
        const started = decide(state, startBreak('k-' + index), {
            now: now,
            localWall: { localDate: date(2026, 8, 6), minuteOfDay: minute(600 + index) },
            utcOffsetMinutes: OFFSET,
            registeredPlan: [],
            horizonDays: 3
        });
        assert.equal(started.tag, 'Ok');
        state = evolveOk(state, started.value.events);
        seen.push(state.breakSession.guidanceId);
        state = evolveOk(state, [{
            tag: 'BreakFinished',
            sessionId: state.breakSession.sessionId,
            finishedAt: now,
            outcome: { tag: 'Completed' }
        }]);
        state = evolveOk(state, [{ tag: 'BreakAcknowledged', sessionId: state.breakSession.sessionId }]);
    }
    assert.deepEqual(seen, [
        'stand-walk-eyes',
        'neck-shoulder-eyes',
        'hip-ankle-eyes',
        'wrist-back-eyes',
        'stand-walk-eyes'
    ]);
});

test('example: complete break finishes with Completed outcome', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const started = decide(state, startBreakNow(), factsAt(2026, 8, 6, 600));
    assert.equal(started.tag, 'Ok');
    state = evolveOk(state, started.value.events);
    assert.equal(state.breakSession.tag, 'Active');

    const done = decide(state, completeBreak(), factsAt(2026, 8, 6, 605));
    assert.equal(done.tag, 'Ok');
    assert.equal(done.value.events[0].tag, 'BreakFinished');
    assert.equal(done.value.events[0].outcome.tag, 'Completed');

    state = evolveOk(state, done.value.events);
    assert.equal(state.breakSession.tag, 'Finished');
    assert.equal(state.breakSession.outcome.tag, 'Completed');
});

test('example: immediate break works from NoBreak, skipping works from Due', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const immediate = decide(state, startBreakNow(), factsAt(2026, 8, 6, 600));
    assert.equal(immediate.tag, 'Ok');
    state = evolveOk(state, immediate.value.events);
    assert.equal(state.breakSession.tag, 'Active');

    // Reset to NoBreak then test skip from Due
    state = evolveOk(state, [{
        tag: 'BreakFinished',
        sessionId: state.breakSession.sessionId,
        finishedAt: factsAt(2026, 8, 6, 605).now,
        outcome: { tag: 'Completed' }
    }]);
    state = evolveOk(state, [{ tag: 'BreakAcknowledged', sessionId: state.breakSession.sessionId }]);
    assert.equal(state.breakSession.tag, 'NoBreak');

    const fired = factsAt(2026, 8, 6, 625);
    const due = decide(state, handleReminderFired('break-start:25-5:2026-08-06:625', fired.now), fired);
    state = evolveOk(state, due.value.events);
    assert.equal(state.breakSession.tag, 'Due');

    const skipped = decide(state, skipBreak(), factsAt(2026, 8, 6, 625));
    assert.equal(skipped.tag, 'Ok');
    state = evolveOk(state, skipped.value.events);
    assert.equal(state.breakSession.tag, 'Finished');
    assert.equal(state.breakSession.outcome.tag, 'Skipped');
});

test('example: invalid transitions return explicit errors', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    assert.equal(decide(state, completeBreak(), factsAt(2026, 8, 6, 600)).error.code, 'INVALID_STATE_TRANSITION');
    assert.equal(decide(state, startBreak('k'), factsAt(2026, 8, 6, 600)).error.code, 'INVALID_STATE_TRANSITION');
    assert.equal(decide(state, acknowledgeBreakFinished(), factsAt(2026, 8, 6, 600)).error.code, 'INVALID_STATE_TRANSITION');
});

test('example: disable cancels every registered reminder and returns to Disabled', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const registered = buildDesiredPlanForState(state, factsAt(2026, 8, 6, 600));
    assert.equal(registered.tag, 'Ok');
    const result = decide(state, disablePlan(), factsAt(2026, 8, 6, 600, {
        registeredPlan: registered.value
    }));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'PlanDisabled');
    assert.equal(cancelKeys(result).length, registered.value.length);

    const applied = evolveOk(state, result.value.events);
    assert.equal(applied.planLifecycle.tag, 'Disabled');
    assert.equal(applied.settings.enabledFlag, false);

    const again = decide(applied, disablePlan(), factsAt(2026, 8, 6, 600));
    assert.deepEqual(again.value.events, []);
    assert.deepEqual(again.value.effects, []);
});

test('example: degraded capability still reconciles but cannot claim reliable enable', () => {
    let state = initialDomainState();
    const degraded = capabilitySupported({ maxPendingCount: 3 });
    state = evolveOk(state, [capabilityObserved(degraded)]);
    const result = decide(state, enablePlan(), factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events.some(function (e) {
        return e.tag === 'PlanEnabled';
    }), true);
    // Rolling window: only the first 3 intents are registered
    const intents = registerIntents(result);
    assert.equal(intents.length, 3);
});

test('example: time change and date change are handled by regeneration from facts', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    // A new day: desired plan starts fresh from Friday's first future intent
    // (565 and 595 are already past at wall 10:00).
    const friday = factsAt(2026, 8, 7, 600);
    const desired = buildDesiredPlanForState(state, friday);
    assert.equal(desired.tag, 'Ok');
    assert.equal(desired.value[0].key.value, 'break-start:25-5:2026-08-07:625');
});

test('example: active session older than its endsAt reduces to Finished Expired', () => {
    let state = enabledStateAt(2026, 8, 6, 600);
    const startedAt = instant(600 * 60000).value;
    const endsAt = instant(605 * 60000).value;
    state = Object.assign({}, state, {
        breakSession: breakActiveState('s1', startedAt, endsAt, 'stand-walk-eyes')
    });
    const later = instant(610 * 60000).value;
    const reduced = reduceTemporalState(state, later);
    assert.equal(reduced.tag, 'Ok');
    assert.equal(reduced.value.breakSession.tag, 'Finished');
    assert.equal(reduced.value.breakSession.outcome.tag, 'Expired');
});

test('example: configure schedule while enabled regenerates the plan and reconciles', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const result = decide(state, {
        tag: 'ConfigureSchedule',
        input: {
            enabledFlag: true,
            weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            workBlocks: [{ start: 540, end: 660 }],
            focusMinutes: 30,
            breakMinutes: 5
        }
    }, factsAt(2026, 8, 6, 600));
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.events[0].tag, 'ScheduleConfigured');
    const intents = registerIntents(result);
    assert.equal(intents.every(function (intent) {
        return intent.key.value.indexOf('break-start:30-5:') === 0;
    }), true);
});

test('example: plan generation respects the lunch boundary', () => {
    const state = enabledStateAt(2026, 8, 6, 600);
    const desired = buildDesiredPlanForState(state, factsAt(2026, 8, 6, 600));
    assert.equal(desired.tag, 'Ok');
    const minutes = desired.value.map(function (intent) {
        return intent.at.value;
    });
    // Morning block ends at 720; no reminder at 725+ from the morning block
    assert.equal(minutes.includes(715), true);
    assert.equal(minutes.includes(725), false);
    // Afternoon starts at 810
    assert.equal(minutes.includes(835), true);
});

test('property: random command sequences never throw and always return tagged results', () => {
    // Model test (test strategy 3): a deterministic pseudo-random walk over the
    // whole command space. Every outcome must be an explicit Result carrying a
    // valid event list or an error code -- never an exception, never an
    // unhandled state tag.
    let seed = 42;
    function rand() {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    }
    function pick(list) {
        return list[Math.floor(rand() * list.length)];
    }

    let state = initialDomainState();
    state = evolveOk(state, [capabilityObserved(SUPPORTED)]);
    state = evolveOk(state, decide(state, enablePlan(), factsAt(2026, 8, 6, 600)).value.events);

    const key = 'break-start:25-5:2026-08-06:625';
    const factory = [
        function () { return enablePlan(); },
        function () { return disablePlan(); },
        function () { return pauseForOneHour(); },
        function () { return pauseForToday(); },
        function () { return skipNext(); },
        function () { return startBreakNow(); },
        function () { return completeBreak(); },
        function () { return skipBreak(); },
        function () { return acknowledgeBreakFinished(); },
        function () { return reconcilePlan(); },
        function () {
            return {
                tag: 'ConfigureSchedule',
                input: {
                    enabledFlag: true,
                    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                    workBlocks: [{ start: 540, end: 660 }],
                    focusMinutes: 25,
                    breakMinutes: 5
                }
            };
        },
        function () {
            const now = factsAt(2026, 8, 6, 625).now;
            return handleReminderFired(key, now);
        }
    ];

    for (let step = 0; step < 200; step += 1) {
        const command = pick(factory)();
        const result = decide(state, command, factsAt(2026, 8, 6, 600 + step));
        assert.equal(result.tag === 'Ok' || result.tag === 'Err', true,
            'decide returned unexpected tag at step ' + step);

        if (result.tag === 'Ok') {
            const evolved = evolveAll(state, result.value.events);
            assert.equal(evolved.tag, 'Ok', 'evolve failed at step ' + step);
            state = evolved.value;
        } else {
            assert.equal(typeof result.error.code, 'string',
                'error without code at step ' + step);
        }
        // Invariant: state always stays within the known lifecycle and session tags.
        assert.equal(typeof state.planLifecycle.tag, 'string');
        assert.equal(typeof state.breakSession.tag, 'string');
    }

    // The walk must land on a fully representable domain state.
    const snapshot = createSnapshot(state);
    assert.equal(snapshot.tag, 'Snapshot');
});
