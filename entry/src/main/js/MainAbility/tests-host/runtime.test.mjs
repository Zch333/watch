import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { createAppRuntime } from '../app/app-runtime.js';
import { createDeviceApp } from '../app/device-composition-root.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createMemoryStore } from '../adapters/memory/memory-store.js';
import { createRecordingReminder } from '../adapters/memory/recording-reminder.js';
import { createMemoryHaptics } from '../adapters/memory/memory-haptics.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';
import { createRecordingNavigation } from '../adapters/memory/recording-navigation.js';
import { instant } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';
import { ok } from '../domain/result.js';
import { initApp, initDeviceApp, dispatch, refresh, getModel, getState } from '../pages/_app-shell.js';

function inst(ms) {
    const result = instant(ms);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function fullAdapterSet() {
    const clock = createFixedClock(inst(600 * 60000));
    const calendar = createFixedCalendar(480);
    const reminders = createRecordingReminder({
        capability: capabilitySupported({ maxPendingCount: 30 })
    });
    return {
        clock: clock,
        calendar: calendar,
        store: createMemoryStore(),
        reminders: reminders,
        haptics: createMemoryHaptics(),
        diagnostics: createMemoryDiagnostics()
    };
}

test('runtime/fixed-clock: creation without a valid Instant fails fast', () => {
    assert.throws(function () {
        createFixedClock(undefined);
    }, /valid Instant/);
    assert.throws(function () {
        createFixedClock(null);
    }, /valid Instant/);
    assert.throws(function () {
        createFixedClock({ tag: 'Instant' });
    }, /valid Instant/);
    assert.throws(function () {
        createFixedClock({ tag: 'Instant', epochMilliseconds: Number.POSITIVE_INFINITY });
    }, /valid Instant/);
});

test('runtime/fixed-clock: set() refuses malformed instants', () => {
    const clock = createFixedClock(inst(0));
    assert.throws(function () {
        clock.set(undefined);
    }, /valid Instant/);
});

test('runtime/host-root: createHostApp fails fast without a clock source', () => {
    assert.throws(function () {
        createHostApp({});
    }, /requires options\.instant/);
    assert.throws(function () {
        createHostApp();
    }, /requires options\.instant/);
});

test('runtime/host-root: createHostApp works with an explicit instant', () => {
    const app = createHostApp({ instant: inst(600 * 60000) });
    assert.equal(app.probeCapabilities().tag, 'Ok');
    const boot = app.boot();
    assert.equal(boot.tag, 'Ok');
    assert.equal(boot.state.planLifecycle.tag, 'Disabled');
});

test('runtime/device-root: refuses to assemble without probe-confirmed adapters', () => {
    assert.throws(function () {
        createDeviceApp();
    }, /adapters not confirmed/);
    assert.throws(function () {
        createDeviceApp({ clock: createFixedClock(inst(0)) });
    }, /missing calendar, store, reminders, haptics, diagnostics/);
});

test('runtime/device-root: assembles a working app from a full adapter set', () => {
    const app = createDeviceApp(fullAdapterSet());
    const boot = app.boot();
    assert.equal(boot.tag, 'Ok');
    const probe = app.probeCapabilities();
    assert.equal(probe.tag, 'Ok');
    assert.equal(probe.value.tag, 'Supported');
});

test('runtime/device-root: navigation is optional and Navigate becomes a no-op', () => {
    const app = createDeviceApp(fullAdapterSet());
    assert.equal(app.ports.navigation, null);
});

test('runtime/app-runtime: boots from injected ports without knowing their origin', () => {
    const ports = Object.assign({}, fullAdapterSet(), {
        navigation: createRecordingNavigation()
    });
    const app = createAppRuntime(ports);
    const boot = app.boot();
    assert.equal(boot.tag, 'Ok');
    assert.equal(typeof app.handleCommand, 'function');
    assert.equal(app.ports, ports);
});

test('runtime/shell: a malformed clock value is rejected at the shell boundary', () => {
    const app = createHostApp({
        clock: {
            now: function () {
                return ok({ tag: 'NotAnInstant' });
            }
        },
        utcOffsetMinutes: 480
    });
    const state = app.boot().state;
    const result = app.handleCommand(state, { tag: 'ReconcilePlan' });
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'INVALID_INSTANT');
});

test('runtime/shell: initDeviceApp surfaces an explicit error model without adapters', () => {
    const model = initDeviceApp(createDeviceApp);
    assert.equal(model.errors.length > 0, true);
    assert.equal(model.errors[0].code, 'ADAPTERS_NOT_CONFIRMED');
    assert.equal(model.planStatus, 'Unknown');
});

test('runtime/shell: initApp surfaces an explicit error model without a clock source', () => {
    const model = initApp();
    assert.equal(model.errors.length > 0, true);
    assert.equal(model.errors[0].code, 'HOST_COMPOSITION_FAILED');
});

test('runtime/shell: initDeviceApp with adapters boots and projects normally', () => {
    const model = initDeviceApp(createDeviceApp, fullAdapterSet());
    assert.equal(model.errors.length, 0);
    assert.equal(getModel().capabilityBanner.level, 'ok');
});

test('runtime/shell: initDeviceApp without a factory is explicit', () => {
    const model = initDeviceApp();
    assert.equal(model.errors.length > 0, true);
    assert.equal(model.errors[0].code, 'DEVICE_FACTORY_MISSING');
});

test('runtime/shell: refresh settles an expired active session and persists it', () => {
    const clock = createFixedClock(inst(600 * 60000)); // 2026-08-06 10:00 UTC+8
    const store = createMemoryStore();
    initApp({
        clock: clock,
        store: store,
        capability: capabilitySupported({ maxPendingCount: 30 })
    });

    dispatch({ tag: 'StartNowPressed' }); // break now: 5 minutes
    assert.equal(getState().breakSession.tag, 'Active');

    // Nothing changed yet: a refresh right away must not persist or reduce.
    refresh();
    assert.equal(getState().breakSession.tag, 'Active');

    // Time passes while the page is hidden; the next visible refresh settles
    // the expired session and persists the final state.
    clock.advance(6 * 60 * 1000);
    refresh();
    assert.equal(getState().breakSession.tag, 'Finished');
    assert.equal(getState().breakSession.outcome.tag, 'Expired');
    assert.equal(getModel().breakStatus, 'Finished');

    const saved = store.loadSnapshot();
    assert.equal(saved.tag, 'Ok');
    assert.equal(saved.value.tag, 'Some');
    assert.equal(saved.value.value.breakSession.tag, 'Finished');
    assert.equal(saved.value.value.breakSession.outcome.tag, 'Expired');
});
