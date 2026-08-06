import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import {
    acknowledgeBreakFinished,
    disablePlan,
    enablePlan,
    handleReminderFired,
    observeCapability,
    pauseForOneHour,
    reconcilePlan,
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
    const registered = app.ports.reminders._registeredKeys();
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
    assert.deepEqual(app.ports.reminders._registeredKeys(), []);
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
    assert.equal(app.ports.reminders._registeredKeys().includes('break-start:25-5:2026-08-06:625'), false);
    // The failure was surfaced in diagnostics.
    const diagnostics = app.ports.diagnostics._all();
    assert.equal(diagnostics.some(function (entry) {
        return entry.tag === 'EffectFailed' && entry.effect === 'RegisterReminders';
    }), true);

    // Transient denial clears; reconcile retries and converges.
    app.ports.reminders._clearFailKeys();
    state = run(app, state, reconcilePlan()).state;
    assert.equal(app.ports.reminders._registeredKeys().includes('break-start:25-5:2026-08-06:625'), true);
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
