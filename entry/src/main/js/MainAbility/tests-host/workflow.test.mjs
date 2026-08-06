import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { REMINDER_NAMESPACE } from '../app/command-handler.js';
import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import {
    acknowledgeBreakFinished,
    configureSchedule,
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
import { buildRecurrenceRules } from '../domain/policy.js';
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
    // In rule mode the leftovers are weekly RULES, not concrete intents.
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    const templateRules = buildRecurrenceRules(state.settings);
    app.ports.reminders.register({
        intents: [],
        recurrenceRules: templateRules.slice(0, 2),
        ruleExceptions: [],
        now: app.ports.clock.now().value,
        expandDays: 3
    });
    assert.equal(app.ports.reminders._ruleMappings().length, 2,
        'two rules remain behind the domain\'s back, like a crashed disable');

    // A repeated Disable in Disabled state must clean the orphans, not no-op:
    // it cancels the template ruleKeys (and reports any concrete leftovers).
    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    assert.deepEqual(registeredKeys(app), []);
    assert.deepEqual(app.ports.reminders._ruleMappings(), [],
        'the orphaned rules must be cancelled by ruleKey');
});

test('workflow: late-tolerance keeps the weekly rule registered across reconcile', () => {
    // Reminder 10:25 due; at 10:26 (inside the 15-minute late window) a
    // reconcile must NOT cancel it. In rule mode the registration is the
    // WEEKLY RULE, not the occurrence, so the rule survives the reconcile
    // and the 10:28 callback still becomes Due.
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    assert.equal(app.ports.reminders._ruleMappings().length > 0, true);

    app.ports.clock.set(at(2026, 8, 6, 626));
    state = run(app, state, reconcilePlan()).state;
    assert.equal(app.ports.reminders._ruleMappings().length > 0, true,
        'reconcile at 10:26 must not cancel the rule covering 10:25');

    // The legal late callback still becomes Due.
    app.ports.clock.set(at(2026, 8, 6, 628));
    state = run(app, state, handleReminderFired('break-start:25-5:2026-08-06:625')).state;
    assert.equal(state.breakSession.tag, 'Due');
    assert.equal(state.breakSession.reminderKey.value, 'break-start:25-5:2026-08-06:625');
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

test('workflow: recurrence rules reach the adapter and cover the FULL configured week', () => {
    // Enable on Monday 2026-08-03: the rules are derived from the complete
    // configuration (Mon–Fri), NOT sampled from the 3-day horizon — a Monday
    // enable must never produce Mon–Wed-only rules (P1-02, which this test
    // previously fixed as expected behavior).
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
    assert.equal(typeof rules[0].ruleKey, 'string');
    assert.ok(rules[0].ruleKey.length > 0, 'every rule must carry a stable ruleKey');
    // The weekday union covers the whole configured week, not just the
    // horizon: Mon–Fri even though the app was enabled on Monday.
    const union = {};
    for (let index = 0; index < rules.length; index += 1) {
        const days = rules[index].weekdays;
        for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
            union[days[dayIndex]] = true;
        }
    }
    assert.deepEqual(Object.keys(union).sort(), ['Fri', 'Mon', 'Thu', 'Tue', 'Wed']);

    // Rule mode is one registration per rule: the registry holds exactly one
    // entry per ruleKey — never per concrete date (P1-01).
    assert.equal(app.ports.reminders._ruleMappings().length, rules.length);
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

test('workflow: re-configuring the schedule in rule mode replaces the rule set, never leaks', () => {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    const before = app.ports.reminders._ruleMappings();
    assert.equal(before.length, 15, 'default Mon–Fri config folds into 15 weekly rules');

    // Narrow the work window to 09:00–11:00: the new template has fewer
    // rules; the old 11:55 (715) rule must NOT survive the re-configure
    // (review HIGH: stale weekly rules keep firing after a settings change).
    const narrow = {
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        workBlocks: [{ start: 540, end: 660 }],
        focusMinutes: 25,
        breakMinutes: 5,
        enabledFlag: true,
        version: 1
    };
    state = run(app, state, configureSchedule(narrow)).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');

    const after = app.ports.reminders._ruleMappings();
    // 09:25, 09:55, 10:25, 10:55: 4 rules for the 09:00–11:00 window.
    assert.equal(after.length, 4);
    assert.equal(after.some(function (m) {
        return m.ruleKey.indexOf('715') >= 0;
    }), false, 'the 11:55 rule must be gone after the re-configure');
    assert.equal(after.some(function (m) {
        return m.ruleKey.indexOf('565') >= 0;
    }), true);
});

test('workflow: disable still cancels weekly rules after the capability degrades', () => {
    // A capability that degrades AFTER recurring rules were registered must
    // not strand them: disable/cleanup always re-asserts ruleKey
    // cancellation, independent of the current strategy (review HIGH).
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    assert.equal(app.ports.reminders._ruleMappings().length > 0, true);

    const degraded = { tag: 'Degraded', reason: 'probe' };
    state = run(app, state, observeCapability(degraded)).state;
    assert.equal(state.capability.tag, 'Degraded');

    state = run(app, state, disablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Disabled');
    assert.deepEqual(app.ports.reminders._ruleMappings(), [],
        'the weekly rules must be cancelled even after the capability degraded');
});

test('workflow: Wednesday enable still yields Mon–Fri weekly rules (scenario H)', () => {
    // The P1-02 empirical probe: enabling on Wednesday with a Mon–Fri
    // configuration must NOT produce {Wed,Thu,Fri}-only rules — Monday and
    // Tuesday would then never fire while the app stays closed.
    const app = createHostApp({ instant: at(2026, 8, 5, 600), utcOffsetMinutes: OFFSET });
    let state = boot(app);
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');

    const rules = app.ports.reminders._lastRecurrenceRules();
    const union = {};
    for (let index = 0; index < rules.length; index += 1) {
        const days = rules[index].weekdays;
        for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
            union[days[dayIndex]] = true;
        }
    }
    assert.deepEqual(Object.keys(union).sort(), ['Fri', 'Mon', 'Thu', 'Tue', 'Wed'],
        'the weekly rules must cover the full configured week, not the 3-day horizon');
});

test('workflow: a one-off skip is an occurrence exception, never a rule-template mutation (scenario I)', () => {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));
    const rulesBefore = app.ports.reminders._lastRecurrenceRules();

    state = run(app, state, skipNext()).state;
    assert.equal(state.skip.tag, 'SkipReminder');

    // The rule template is unchanged: every slot survives the skip.
    const rulesAfter = app.ports.reminders._lastRecurrenceRules();
    assert.deepEqual(rulesAfter, rulesBefore);
    // The skip is expressed as a rule exception (occurrence-level), so the
    // adapter silences exactly that occurrence on its date.
    const exceptions = app.ports.reminders._lastRuleExceptions();
    assert.equal(exceptions.length, 1);
    assert.equal(exceptions[0].action, 'skip');
    assert.equal(exceptions[0].occurrenceDate.day, 6);
    // The skipped occurrence leaves the registered view; the other slots of
    // the same rule stay (the rule registration itself is untouched).
    const view = registeredKeys(app);
    assert.equal(view.includes('break-start:25-5:2026-08-06:625'), false);
    assert.equal(view.includes('break-start:25-5:2026-08-06:655'), true);
    assert.equal(app.ports.reminders._ruleMappings().length, rulesBefore.length);
});

test('workflow: rule callback validity follows plan containment, not arrival time', () => {
    // Documented callback rule: validity is decided by whether the suppressed
    // plan contains the key. A queued rule callback whose occurrence date is
    // outside the reconcile window (e.g. delivered long after the app was
    // closed) is stale and must be ignored with a diagnostic, never popped.
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = enableFlow(app, boot(app));

    // A callback whose key date (2026-08-03, last Monday) lies before today
    // is not in the suppressed plan and not in the window: stale.
    app.ports.clock.set(at(2026, 8, 6, 601));
    state = run(app, state, handleReminderFired('break-start:25-5:2026-08-03:625')).state;
    assert.equal(state.breakSession.tag, 'NoBreak');
    const diagnostics = diagnosticsEntries(app);
    assert.equal(diagnostics.some(function (entry) {
        return entry.tag === 'StaleReminderIgnored';
    }), true);

    // A callback for an occurrence whose rhythm no longer matches the
    // configuration (settings changed to 30-5) is stale too: the rule
    // template of the CURRENT settings does not contain it.
    const oldRhythm = run(app, state, handleReminderFired('break-start:30-5:2026-08-06:625')).state;
    assert.equal(oldRhythm.breakSession.tag, 'NoBreak');
});
