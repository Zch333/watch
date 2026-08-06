import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { REMINDER_NAMESPACE } from '../app/command-handler.js';
import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import {
    acknowledgeBreakFinished,
    disablePlan,
    enablePlan,
    handleReminderFired,
    observeCapability,
    pauseForOneHour,
    reconcilePlan,
    skipNext,
    startBreak
} from '../domain/commands.js';
import { localToInstant } from '../domain/calendar.js';
import { localDate, minuteOfDay } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';

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

function at(y, m, d, minuteValue) {
    return localToInstant(date(y, m, d), minuteOfDay(minuteValue).value, OFFSET).value;
}

function run(app, state, command) {
    const result = app.handleCommand(state, command);
    assert.equal(result.tag, 'Ok',
        'command ' + command.tag + ' failed: ' + (result.error && result.error.code));
    return result;
}

function boot(app) {
    const result = app.boot();
    assert.equal(result.tag, 'Ok', 'boot failed: ' + (result.error && result.error.code));
    return result.state;
}

function enableFlow(app, state) {
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');
    return state;
}

/**
 * Formal query: the registered plan comes from the port contract, not from
 * adapter privates.
 */
function registeredKeys(app) {
    return app.ports.reminders.listRegistered(REMINDER_NAMESPACE).value.map(function (intent) {
        return intent.key.value;
    });
}

function diagnosticsEntries(app) {
    return app.ports.diagnostics.readRecent(100).value;
}

test('workflow: full journey from enable to disable on memory adapters', () => {
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED
    });
    assert.equal(app.probeCapabilities().value.tag, 'Supported');

    let state = boot(app);
    assert.equal(state.planLifecycle.tag, 'Disabled');

    state = enableFlow(app, state);
    const registered = registeredKeys(app);
    assert.equal(registered.includes('break-start:25-5:2026-08-06:625'), true);
    assert.equal(registered.includes('break-start:25-5:2026-08-06:655'), true);

    // Reminder fires at 10:25.
    app.ports.clock.set(at(2026, 8, 6, 625));
    state = run(app, state, handleReminderFired('break-start:25-5:2026-08-06:625')).state;
    assert.equal(state.breakSession.tag, 'Due');
    assert.deepEqual(app.ports.haptics._patterns(), ['BreakStart']);
    assert.deepEqual(app.ports.navigation._routes(), ['break-due']);

    // Start the break: ends at 10:30.
    state = run(app, state, startBreak('break-start:25-5:2026-08-06:625')).state;
    assert.equal(state.breakSession.tag, 'Active');
    assert.equal(state.breakSession.guidanceId, 'stand-walk-eyes');

    // A later reconcile expires the finished session.
    app.ports.clock.set(at(2026, 8, 6, 630));
    state = run(app, state, reconcilePlan()).state;
    assert.equal(state.breakSession.tag, 'Finished');
    assert.equal(state.breakSession.outcome.tag, 'Expired');

    state = run(app, state, acknowledgeBreakFinished()).state;
    assert.equal(state.breakSession.tag, 'NoBreak');

    // Disable cancels everything.
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    assert.deepEqual(registeredKeys(app), []);
});

test('workflow: partial registration failure is visible and reconciled on retry', () => {
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        failKeys: ['break-start:25-5:2026-08-06:625']
    });
    let state = boot(app);
    state = run(app, state, observeCapability(SUPPORTED)).state;
    const enableResult = run(app, state, enablePlan());
    state = enableResult.state;

    // The failed key is absent from the system registry.
    assert.equal(registeredKeys(app).includes('break-start:25-5:2026-08-06:625'), false);
    // The failure was surfaced in diagnostics.
    const diagnostics = diagnosticsEntries(app);
    assert.equal(diagnostics.some(function (entry) {
        return entry.tag === 'EffectFailed' && entry.effect === 'RegisterReminders';
    }), true);

    // Transient denial clears; reconcile retries and converges.
    app.ports.reminders._clearFailKeys();
    state = run(app, state, reconcilePlan()).state;
    assert.equal(registeredKeys(app).includes('break-start:25-5:2026-08-06:625'), true);
});

test('workflow: restart recovery reduces expired active session and paused plan', () => {
    // Session 1: enable and start a break that ends at 10:30.
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    app.ports.clock.set(at(2026, 8, 6, 625));
    state = run(app, state, handleReminderFired('break-start:25-5:2026-08-06:625')).state;
    state = run(app, state, startBreak('break-start:25-5:2026-08-06:625')).state;
    assert.equal(state.breakSession.tag, 'Active');

    // The persisted snapshot carries the Active session.
    const stored = app.ports.store.loadSnapshot().value.value;
    assert.equal(stored.breakSession.tag, 'Active');

    // "Reboot": fresh app sharing store + reminder registry, clock now 10:35.
    const app2 = createHostApp({
        utcOffsetMinutes: OFFSET,
        store: app.ports.store,
        reminders: app.ports.reminders,
        clock: createFixedClock(at(2026, 8, 6, 635))
    });
    let state2 = boot(app2);
    assert.equal(state2.breakSession.tag, 'Active');
    state2 = run(app2, state2, reconcilePlan()).state;
    assert.equal(state2.breakSession.tag, 'Finished');
    assert.equal(state2.breakSession.outcome.tag, 'Expired');
});

test('workflow: expired pause resumes after restart', () => {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    state = run(app, state, pauseForOneHour()).state;
    assert.equal(state.planLifecycle.tag, 'Paused');

    const app2 = createHostApp({
        utcOffsetMinutes: OFFSET,
        store: app.ports.store,
        reminders: app.ports.reminders,
        clock: createFixedClock(at(2026, 8, 6, 700))
    });
    let state2 = boot(app2);
    assert.equal(state2.planLifecycle.tag, 'Paused');
    state2 = run(app2, state2, reconcilePlan()).state;
    assert.equal(state2.planLifecycle.tag, 'Enabled');
    assert.equal(state2.pause.tag, 'NoPause');
});

test('workflow: persistence failure returns Err and never exposes the candidate state', () => {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = boot(app);
    const baselineRevision = state.revision;

    app.ports.store._failNextSave();
    const result = app.handleCommand(state, observeCapability(SUPPORTED));

    // The command must fail explicitly: unpersisted state is never Ok.
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'IO_FAILURE');
    // The returned state is the last committed one, with its revision intact.
    assert.equal(result.state.revision, baselineRevision);
    // The store revision did not move either, so later saves do not collide.
    assert.equal(app.ports.store.readStatus().value.revision, baselineRevision);

    // After the transient failure clears, the same command succeeds and the
    // revision advances exactly once from the committed baseline.
    state = run(app, state, observeCapability(SUPPORTED)).state;
    assert.equal(state.revision, baselineRevision + 1);
});

test('workflow: cancel failure never commits Disabled and retry converges', () => {
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED
    });
    let state = enableFlow(app, boot(app));
    const enabledRevision = state.revision;
    assert.equal(registeredKeys(app).length > 0, true);

    // Cancelling fails: the command must return Err and keep Enabled.
    app.ports.reminders._setFailCancel(true);
    const failed = app.handleCommand(state, disablePlan());
    assert.equal(failed.tag, 'Err');
    assert.equal(failed.error.code, 'PERMISSION_DENIED');
    assert.equal(failed.state.planLifecycle.tag, 'Enabled');
    assert.equal(failed.state.revision, enabledRevision);
    // The snapshot is still Enabled as well.
    assert.equal(app.ports.store.loadSnapshot().value.value.planLifecycle.tag, 'Enabled');

    // Transient failure clears: disable retries and finally converges.
    app.ports.reminders._setFailCancel(false);
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    assert.deepEqual(registeredKeys(app), []);
});

test('workflow: orphan reminders are cleaned up by a later Disable or Reconcile', () => {
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED
    });
    let state = enableFlow(app, boot(app));
    assert.equal(registeredKeys(app).length > 0, true);

    // Simulate the crash/failure aftermath: state persisted as Disabled but
    // the system registry still holds reminders (a failed cancel earlier).
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    // Re-register everything behind the domain's back, like a crashed disable.
    const desired = app.ports.reminders.listRegistered(REMINDER_NAMESPACE);
    app.ports.reminders.register({
        intents: desired.value.slice(0, 2),
        recurrenceRules: []
    });

    // A repeated Disable in Disabled state must clean the orphans, not no-op.
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    assert.deepEqual(registeredKeys(app), []);
});

test('workflow: late-tolerance keeps a pending reminder registered across reconcile', () => {
    // Reminder 10:25 due; at 10:26 (inside the 15-minute late window) a
    // reconcile must NOT cancel it; the 10:28 callback still becomes Due.
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    assert.equal(registeredKeys(app).includes('break-start:25-5:2026-08-06:625'), true);

    app.ports.clock.set(at(2026, 8, 6, 626));
    state = run(app, state, reconcilePlan()).state;
    assert.equal(registeredKeys(app).includes('break-start:25-5:2026-08-06:625'), true,
        'reconcile at 10:26 must not cancel a reminder due at 10:25');

    // The legal late callback still becomes Due.
    app.ports.clock.set(at(2026, 8, 6, 628));
    state = run(app, state, handleReminderFired('break-start:25-5:2026-08-06:625')).state;
    assert.equal(state.breakSession.tag, 'Due');
    assert.equal(state.breakSession.reminderKey.value, 'break-start:25-5:2026-08-06:625');

    // Once beyond the tolerance (10:41), the next reconcile cancels it.
    app.ports.clock.set(at(2026, 8, 6, 641));
    state = run(app, state, reconcilePlan()).state;
    assert.equal(registeredKeys(app).includes('break-start:25-5:2026-08-06:625'), false);
});

test('workflow: skip cancels a future-dated reminder immediately', () => {
    // The late-delivery cancel guard only protects reminders that are ALREADY
    // due; a future-dated leftover (skip/pause/settings change) must leave the
    // registry right away or it would keep firing later for nothing.
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    const key = 'break-start:25-5:2026-08-06:625';
    assert.equal(registeredKeys(app).includes(key), true);

    state = run(app, state, skipNext()).state;
    assert.equal(registeredKeys(app).includes(key), false,
        'a skipped future reminder must be cancelled immediately');
});

test('workflow: recurrence rules reach the adapter on recurring capability', () => {
    // Enable on Monday 2026-08-03: the 3-day horizon spans Mon–Wed, so the
    // weekly rules carry exactly those weekdays.
    const app = createHostApp({ instant: at(2026, 8, 3, 600), utcOffsetMinutes: OFFSET });
    let state = boot(app);
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');

    const rules = app.ports.reminders._lastRecurrenceRules();
    assert.equal(Array.isArray(rules), true);
    assert.equal(rules.length > 0, true);
    assert.equal(rules[0].tag, 'RecurrenceRule');
    assert.equal(rules[0].repeatKind, 'Weekly');
    assert.deepEqual(rules[0].weekdays, ['Mon', 'Tue', 'Wed']);
});

test('workflow: DST boundary resolves every future local time individually', () => {
    // A calendar adapter whose UTC offset changes on 2026-10-20 (DST switch):
    // resolve() returns the correct offset per DATE, never the current one.
    // Mon 10-19 and Tue 10-20 are both weekdays, so both appear in the plan.
    const SWITCH_DATE = { year: 2026, month: 10, day: 20 };
    const dstCalendar = {
        utcOffset() {
            return { tag: 'Ok', value: 480 };
        },
        localWall(instantValue) {
            // Not exercised by this test; delegate to the fixed algebra.
            return createFixedCalendar(480).localWall(instantValue);
        },
        resolve(localDateValue, minuteOfDayValue) {
            const after = localDateValue.year > SWITCH_DATE.year ||
                (localDateValue.year === SWITCH_DATE.year &&
                    (localDateValue.month > SWITCH_DATE.month ||
                        (localDateValue.month === SWITCH_DATE.month &&
                            localDateValue.day >= SWITCH_DATE.day)));
            const offset = after ? 540 : 480;
            return localToInstant(localDateValue, minuteOfDayValue, offset);
        }
    };
    const app = createHostApp({
        instant: at(2026, 10, 19, 600),
        utcOffsetMinutes: 480,
        calendar: dstCalendar
    });
    let state = boot(app);
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;

    // 2026-10-19 10:25: before the switch (UTC+8) -> 02:25 UTC.
    const before = app.ports.reminders.listRegistered(REMINDER_NAMESPACE).value.find(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-10-19:625';
    });
    assert.equal(!!before, true);
    assert.equal(before.dueAt.epochMilliseconds,
        localToInstant({ tag: 'LocalDate', year: 2026, month: 10, day: 19 },
            { tag: 'MinuteOfDay', value: 625 }, 480).value.epochMilliseconds);

    // 2026-10-20 10:25: after the switch (UTC+9) -> 01:25 UTC. The spread
    // between the two same-local-minute reminders is 23h (one calendar day
    // minus the DST hour); a single current offset would have registered a
    // 24h spread (review P1-01).
    const after = app.ports.reminders.listRegistered(REMINDER_NAMESPACE).value.find(function (intent) {
        return intent.key.value === 'break-start:25-5:2026-10-20:625';
    });
    assert.equal(!!after, true);
    assert.equal(after.dueAt.epochMilliseconds,
        localToInstant({ tag: 'LocalDate', year: 2026, month: 10, day: 20 },
            { tag: 'MinuteOfDay', value: 625 }, 540).value.epochMilliseconds);
    assert.equal(after.dueAt.epochMilliseconds - before.dueAt.epochMilliseconds,
        23 * 60 * 60000);
});
