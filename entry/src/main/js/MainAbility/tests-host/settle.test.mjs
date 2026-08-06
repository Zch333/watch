import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { settlePlanLifecycle } from '../domain/settle.js';
import { domainError } from '../domain/errors.js';
import { ok, err } from '../domain/result.js';
import { reminderError, REMINDER_ERROR_CODES } from '../ports/reminder-port.js';
import { localToInstant } from '../domain/calendar.js';
import { localDate, minuteOfDay, instant } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';
import { enablePlan, observeCapability, reconcilePlan, startBreakNow } from '../domain/commands.js';

const OFFSET = 480;
const SUPPORTED = capabilitySupported({ maxPendingCount: 30 });

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function at(y, m, d, minuteValue) {
    return localToInstant(date(y, m, d), minuteOfDay(minuteValue).value, OFFSET).value;
}

/**
 * Reminder adapter whose register() can be forced to fail totally or per-key,
 * and whose listRegistered() can be forced to fail, to exercise settlement.
 */
function scriptedReminder(capability, options) {
    const opts = options || {};
    const registry = new Map();
    let counter = 0;
    let mode = opts.mode || 'ok';
    let failList = !!opts.failList;
    return {
        probeCapabilities() {
            return ok(capability);
        },
        listRegistered() {
            if (failList) {
                return err(reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null));
            }
            const list = [];
            registry.forEach(function (entry) {
                list.push(entry.intent);
            });
            return ok(Object.freeze(list));
        },
        register(intents) {
            if (mode === 'all-fail') {
                const failed = intents.map(function (intent) {
                    return { key: intent.key.value, error: reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null) };
                });
                return err(reminderError(REMINDER_ERROR_CODES.PARTIAL_FAILURE, {
                    registered: Object.freeze([]),
                    failed: Object.freeze(failed)
                }));
            }
            const registered = [];
            const failed = [];
            for (let index = 0; index < intents.length; index += 1) {
                const intent = intents[index];
                const key = intent.key.value;
                if (mode === 'partial' && key.indexOf(':625') >= 0) {
                    failed.push({ key: key, error: reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null) });
                    continue;
                }
                if (registry.has(key)) {
                    registered.push({ key: key, systemId: registry.get(key).systemId });
                    continue;
                }
                counter += 1;
                registry.set(key, { systemId: 's' + counter, intent: intent });
                registered.push({ key: key, systemId: 's' + counter });
            }
            const report = {
                registered: Object.freeze(registered),
                failed: Object.freeze(failed)
            };
            if (failed.length > 0) {
                return err(reminderError(REMINDER_ERROR_CODES.PARTIAL_FAILURE, report));
            }
            return ok(report);
        },
        cancel(keys) {
            const cancelled = [];
            const missing = [];
            for (let index = 0; index < keys.length; index += 1) {
                if (registry.has(keys[index])) {
                    registry.delete(keys[index]);
                    cancelled.push(keys[index]);
                } else {
                    missing.push(keys[index]);
                }
            }
            return ok({ cancelled: cancelled, missing: missing });
        },
        _setMode(nextMode) {
            mode = nextMode;
        },
        _setFailList(value) {
            failList = !!value;
        },
        _registeredKeys() {
            return Array.from(registry.keys());
        }
    };
}

function run(app, state, command) {
    const result = app.handleCommand(state, command);
    assert.equal(result.tag, 'Ok',
        'command ' + command.tag + ' failed: ' + (result.error && result.error.code));
    return result;
}

// ---------------------------------------------------------------- settle (pure)

test('settle: full registration keeps PlanEnabled', () => {
    const state = { planLifecycle: { tag: 'Enabling' } };
    const events = [
        { tag: 'PlanEnableRequested' },
        { tag: 'PlanEnabled' },
        { tag: 'PlanReconciled', diff: {} }
    ];
    const result = settlePlanLifecycle(state, events, { tag: 'Registered' });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value, events);
});

test('settle: partial registration drops PlanEnabled so the plan stays Enabling', () => {
    const state = { planLifecycle: { tag: 'Enabling' } };
    const events = [
        { tag: 'PlanEnableRequested' },
        { tag: 'PlanEnabled' },
        { tag: 'PlanReconciled', diff: {} }
    ];
    const result = settlePlanLifecycle(state, events, { tag: 'Partial', failedKeys: ['k'] });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.map(function (e) {
        return e.tag;
    }), ['PlanEnableRequested', 'PlanReconciled']);
});

test('settle: total failure replaces PlanEnabled with PlanBlocked', () => {
    const state = { planLifecycle: { tag: 'Enabling' } };
    const events = [
        { tag: 'PlanEnableRequested' },
        { tag: 'PlanEnabled' },
        { tag: 'PlanReconciled', diff: {} }
    ];
    const result = settlePlanLifecycle(state, events, { tag: 'Failed', code: 'PERMISSION_DENIED' });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.map(function (e) {
        return e.tag;
    }), ['PlanEnableRequested', 'PlanBlocked', 'PlanReconciled']);
    const blocked = result.value[1];
    assert.equal(blocked.error.code, 'REMINDER_REGISTRATION_FAILED');
});

test('settle: reconcile completing a pending enable appends PlanEnabled', () => {
    const state = { planLifecycle: { tag: 'Enabling' } };
    const events = [{ tag: 'PlanReconciled', diff: {} }];
    const result = settlePlanLifecycle(state, events, { tag: 'Registered' });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.map(function (e) {
        return e.tag;
    }), ['PlanReconciled', 'PlanEnabled']);
});

test('settle: total failure while awaiting enable blocks even without PlanEnabled in this decision', () => {
    const state = { planLifecycle: { tag: 'Enabling' } };
    const events = [{ tag: 'PlanReconciled', diff: {} }];
    const result = settlePlanLifecycle(state, events, { tag: 'Failed', code: 'PERMISSION_DENIED' });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.map(function (e) {
        return e.tag;
    }), ['PlanReconciled', 'PlanBlocked']);
});

test('settle: no registration outcome leaves events untouched', () => {
    const state = { planLifecycle: { tag: 'Disabled' } };
    const events = [{ tag: 'BreakBecameDue', reminderKey: { tag: 'SemanticKey', value: 'k' } }];
    const result = settlePlanLifecycle(state, events, undefined);
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value, events);
});

// ---------------------------------------------------------------- shell gating

test('shell: enable claims Enabled only when registration fully succeeds', () => {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = app.boot().state;
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');
    assert.equal(state.settings.enabledFlag, true);
});

test('shell: total registration failure must never show Enabled', () => {
    const reminders = scriptedReminder(SUPPORTED, { mode: 'all-fail' });
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        reminders: reminders
    });
    let state = app.boot().state;
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Blocked');
    assert.equal(state.settings.enabledFlag, false);
    assert.equal(state.planLifecycle.error.code, 'REMINDER_REGISTRATION_FAILED');
});

test('shell: partial registration failure stays Enabling and reconcile converges', () => {
    const reminders = scriptedReminder(SUPPORTED, { mode: 'partial' });
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        reminders: reminders
    });
    let state = app.boot().state;
    state = run(app, state, observeCapability(SUPPORTED)).state;
    state = run(app, state, enablePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabling');
    assert.equal(state.settings.enabledFlag, false);

    // Transient denial clears; reconcile completes the pending enable.
    reminders._setMode('ok');
    state = run(app, state, reconcilePlan()).state;
    assert.equal(state.planLifecycle.tag, 'Enabled');
    assert.equal(state.settings.enabledFlag, true);
});

test('shell: reconcile failure for a command needing the registered plan is explicit', () => {
    const reminders = scriptedReminder(SUPPORTED, { failList: true });
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        reminders: reminders
    });
    let state = app.boot().state;
    state = run(app, state, observeCapability(SUPPORTED)).state;
    const result = app.handleCommand(state, enablePlan());
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'REMINDER_LIST_UNAVAILABLE');
    // State unchanged: "unknown" must never be read as "empty".
    assert.equal(result.state.planLifecycle.tag, 'Disabled');
});

test('shell: commands that do not need the registered plan proceed despite a broken list', () => {
    const reminders = scriptedReminder(SUPPORTED, { failList: true });
    const app = createHostApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        reminders: reminders
    });
    let state = app.boot().state;
    const result = run(app, state, startBreakNow());
    assert.equal(result.state.breakSession.tag, 'Active');
});
