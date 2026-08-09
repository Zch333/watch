import assert from 'node:assert/strict';
import test from 'node:test';

import { initApp, dispatch, refresh, getModel } from '../pages/_app-shell.js';
import { update } from '../pages/mvu/update.js';
import { initialUiModel, projectModel } from '../pages/mvu/model.js';
import { actionLabels } from '../pages/mvu/labels.js';
import { initialDomainState } from '../domain/model.js';
import { localToInstant } from '../domain/calendar.js';
import { localDate, minuteOfDay } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';

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

async function loadSettingsPage() {
    const mod = await import('../pages/settings/index.js');
    return mod.default;
}

async function withLiteRuntime(fakeRuntime, action) {
    const previous = globalThis.__MOVE25_LITE_RUNTIME__;
    globalThis.__MOVE25_LITE_RUNTIME__ = fakeRuntime;
    try {
        await action();
    } finally {
        if (previous === undefined) {
            delete globalThis.__MOVE25_LITE_RUNTIME__;
        } else {
            globalThis.__MOVE25_LITE_RUNTIME__ = previous;
        }
    }
}

function delayedRuntime(model) {
    const callbacks = [];
    const routes = [];
    return {
        callbacks: callbacks,
        routes: routes,
        start() {},
        isReady() { return true; },
        refresh() { return model; },
        dispatch(message, done) {
            callbacks.push({ message: message, done: done });
            return Object.assign({}, model, { commandPending: true });
        },
        navigateTo(route) {
            routes.push(route);
            return { tag: 'Ok' };
        }
    };
}

test('mvu: BreakElapsed maps to a reconcile command (absolute-time reduction)', () => {
    const result = update(initialUiModel(), { tag: 'BreakElapsed' });
    assert.equal(result.commands.length, 1);
    assert.equal(result.commands[0].tag, 'ReconcilePlan');
});

test('mvu: guidance action keys project to Chinese display labels', () => {
    assert.deepEqual(actionLabels(['stand_and_walk', 'simple_stretch', 'look_far']), [
        '站起来走动',
        '简单伸展',
        '看向远处放松眼睛'
    ]);
    // Unknown keys fall back to the key itself instead of disappearing.
    assert.deepEqual(actionLabels(['mystery_action']), ['mystery_action']);
});

test('settings: opening the page restores the real plan (25/5, Mon-Fri) instead of a 50/10 default', async () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    dispatch({ tag: 'EnablePressed' });
    assert.equal(getModel().planStatus, 'Enabled');

    const page = await loadSettingsPage();
    page.restoreFromModel();
    assert.equal(page.selectedRhythm, 0, 'default rhythm must stay 25/5');
    assert.equal(page.selectedBlock, 0);
    assert.deepEqual(page.weekdayOn, [true, true, true, true, true, false, false]);
    assert.equal(page.enabledFlag, true);
});

test('settings: saving without edits preserves the current 25/5 plan', async () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    dispatch({ tag: 'EnablePressed' });
    const before = getModel().nextBreakText;
    assert.equal(before, '10:25');

    const page = await loadSettingsPage();
    page.restoreFromModel();
    page.onSave();

    const after = getModel();
    assert.equal(after.planStatus, 'Enabled');
    // Still 25/5: the first break of the day remains at 10:25.
    assert.equal(after.nextBreakText, '10:25');
});

test('settings: waits for the durable save callback before leaving the page', async () => {
    const page = await loadSettingsPage();
    const routes = [];
    let saveDone = null;
    const previousLiteRuntime = globalThis.__MOVE25_LITE_RUNTIME__;
    globalThis.__MOVE25_LITE_RUNTIME__ = {
        start() {},
        isReady() { return true; },
        refresh() {
            return {
                planStatus: 'Disabled',
                settingsSummary: {
                    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                    blocks: ['09:00–12:00', '13:30–18:00'],
                    rawBlocks: [{ start: 540, end: 720 }, { start: 810, end: 1080 }],
                    focusMinutes: 25,
                    breakMinutes: 5
                }
            };
        },
        dispatch(message, done) {
            assert.equal(message.tag, 'SettingsSaved');
            saveDone = done;
            return { errors: [], commandPending: true };
        },
        navigateTo(route) {
            routes.push(route);
        }
    };

    try {
        page.restoreFromModel();
        page.onRhythm1();
        page.onSave();
        assert.equal(page.saving, true);
        assert.equal(page.statusText, '正在保存…');
        assert.deepEqual(routes, [], 'must stay on settings while storage is pending');

        saveDone({ errors: [] }, { tag: 'Ok' });
        assert.equal(page.saving, false);
        assert.deepEqual(routes, ['home'], 'navigate only after durable success');
    } finally {
        if (previousLiteRuntime === undefined) {
            delete globalThis.__MOVE25_LITE_RUNTIME__;
        } else {
            globalThis.__MOVE25_LITE_RUNTIME__ = previousLiteRuntime;
        }
    }
});

test('home: immediate break navigates only after durable command completion', async () => {
    const fake = delayedRuntime({ errors: [], canSchedule: true, planStatus: 'Disabled' });
    await withLiteRuntime(fake, async () => {
        const page = (await import('../pages/home/index.js')).default;
        page.onStartNow();
        assert.deepEqual(fake.routes, [], 'pending storage must keep the user on home');
        assert.equal(fake.callbacks[0].message.tag, 'StartNowPressed');

        fake.callbacks[0].done({ errors: [] }, { tag: 'Ok' });
        assert.deepEqual(fake.routes, ['break-active']);
    });
});

test('home: failed immediate break stays on home and shows the committed failure', async () => {
    const fake = delayedRuntime({ errors: [], canSchedule: true, planStatus: 'Disabled' });
    await withLiteRuntime(fake, async () => {
        const page = (await import('../pages/home/index.js')).default;
        page.onStartNow();
        fake.callbacks[0].done({ errors: [{ code: 'IO_FAILURE', text: '操作失败' }] }, {
            tag: 'Err', error: { code: 'IO_FAILURE' }
        });
        assert.deepEqual(fake.routes, []);
        assert.equal(page.hasError, true);
        assert.equal(page.errorText, '操作失败');
    });
});

test('more: pause action waits for durable completion before returning home', async () => {
    const fake = delayedRuntime({ errors: [] });
    await withLiteRuntime(fake, async () => {
        const page = (await import('../pages/more/index.js')).default;
        page.onPauseToday();
        assert.deepEqual(fake.routes, []);
        assert.equal(fake.callbacks[0].message.tag, 'PauseTodayPressed');
        fake.callbacks[0].done({ errors: [] }, { tag: 'Ok' });
        assert.deepEqual(fake.routes, ['home']);
    });
});

test('break pages: session transitions navigate only after durable completion', async () => {
    const fake = delayedRuntime({ errors: [] });
    await withLiteRuntime(fake, async () => {
        const active = (await import('../pages/break-active/index.js')).default;
        active.onComplete();
        assert.deepEqual(fake.routes, []);
        assert.equal(fake.callbacks[0].message.tag, 'CompletePressed');
        fake.callbacks[0].done({ errors: [] }, { tag: 'Ok' });
        assert.deepEqual(fake.routes, ['home']);

        fake.routes.length = 0;
        const due = (await import('../pages/break-due/index.js')).default;
        due.reminderKey = 'move25:test';
        due.onStart();
        assert.deepEqual(fake.routes, []);
        assert.equal(fake.callbacks[1].message.tag, 'StartDuePressed');
        fake.callbacks[1].done({ errors: [] }, { tag: 'Ok' });
        assert.deepEqual(fake.routes, ['break-active']);
    });
});

test('settings: custom rhythm and weekend selections restore correctly', async () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    dispatch({
        tag: 'SettingsSaved',
        raw: {
            enabledFlag: false,
            weekdays: ['Mon', 'Wed', 'Fri', 'Sat'],
            workBlocks: [{ start: 540, end: 720 }, { start: 810, end: 1080 }],
            focusMinutes: 50,
            breakMinutes: 10
        }
    });

    const page = await loadSettingsPage();
    page.restoreFromModel();
    assert.equal(page.selectedRhythm, 1, '50/10 preset is index 1');
    assert.deepEqual(page.weekdayOn, [true, false, true, false, true, true, false]);
    assert.equal(page.enabledFlag, false);
});

test('mvu: projectModel carries shell errors instead of wiping them', () => {
    const state = initialDomainState();
    const carried = Object.freeze([{ text: '操作失败', code: 'REMINDER_LIST_UNAVAILABLE' }]);
    const model = projectModel(state, {}, carried);
    assert.equal(model.errors.length, 1);
    assert.equal(model.errors[0].code, 'REMINDER_LIST_UNAVAILABLE');
    // Without carried errors the projection stays empty (fresh boot/success).
    assert.equal(projectModel(state, {}).errors.length, 0);
});

test('shell: a failed command error survives refresh and clears on the next success', () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    // Invalid settings input: configureSchedule fails, error lands on the model.
    dispatch({
        tag: 'SettingsSaved',
        raw: { enabledFlag: true, weekdays: [], workBlocks: [], focusMinutes: 0, breakMinutes: 0 }
    });
    assert.equal(getModel().errors.length > 0, true);
    const failedCode = getModel().errors[0].code;

    // A plain re-render must keep the error visible.
    refresh();
    assert.equal(getModel().errors.length, 1);
    assert.equal(getModel().errors[0].code, failedCode);

    // The next successful command clears the stale failure notice.
    dispatch({ tag: 'EnablePressed' });
    assert.equal(getModel().errors.length, 0);
    assert.equal(getModel().planStatus, 'Enabled');
});

test('more: secondary actions dispatch through the MVU pipeline', async () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    dispatch({ tag: 'EnablePressed' });
    assert.equal(getModel().planStatus, 'Enabled');

    const page = (await import('../pages/more/index.js')).default;
    page.onPauseToday();
    assert.equal(getModel().planStatus, 'Paused');
    assert.equal(getModel().errors.length, 0);

    page.onSettings();
    page.onDiagnostics();
    assert.equal(getModel().errors.length, 0);
});

test('settings: opening and saving custom (non-preset) values is lossless', async () => {
    initApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET, capability: SUPPORTED });
    // 40/8 rhythm with a custom work block: no preset matches either.
    dispatch({
        tag: 'SettingsSaved',
        raw: {
            enabledFlag: false,
            weekdays: ['Mon', 'Wed'],
            workBlocks: [{ start: 600, end: 720 }],
            focusMinutes: 40,
            breakMinutes: 8
        }
    });
    assert.equal(getModel().errors.length, 0);

    const page = await loadSettingsPage();
    page.restoreFromModel();
    assert.equal(page.selectedBlock, -1, 'custom blocks must not map to the first preset');
    assert.equal(page.selectedRhythm, -1, 'custom rhythm must not map to the first preset');
    assert.deepEqual(page.originalBlocks, [{ start: 600, end: 720 }]);
    assert.equal(page.originalFocusMinutes, 40);
    assert.equal(page.originalBreakMinutes, 8);

    // Save without touching anything: the custom values must survive exactly
    // instead of being silently replaced by 25/5 defaults (P1-09).
    page.onSave();
    const model = getModel();
    assert.equal(model.errors.length, 0);
    const summary = model.settingsSummary;
    assert.equal(summary.focusMinutes, 40);
    assert.equal(summary.breakMinutes, 8);
    assert.deepEqual(summary.rawBlocks, [{ start: 600, end: 720 }]);
    assert.deepEqual(summary.weekdays, ['Mon', 'Wed']);
});

test('diagnostics: the page shows the newest eight entries first', async () => {
    const diagnostics = createMemoryDiagnostics();
    initApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED,
        diagnostics: diagnostics
    });
    // Append AFTER boot so the boot-time capability entries are older than
    // the twelve seeded ones.
    for (let index = 1; index <= 12; index += 1) {
        diagnostics.append({ tag: 'E' + index, at: index });
    }
    const page = (await import('../pages/diagnostics/index.js')).default;
    page.render();
    assert.equal(page.appVersion, 'Host');
    assert.equal(page.sdkLabel, 'Host');
    assert.equal(page.timezone, 'UTC+08:00');
    assert.equal(page.hapticsState, 'WiredUnverified');
    assert.equal(page.deliveryMode, 'WatchStandalone');
    assert.equal(page.lastError, 'None');
    assert.equal(page.entries.length, 8);
    assert.equal(page.entries[0], 'E12', 'the newest entry must be first');
    assert.equal(page.entries[7], 'E5', 'the oldest shown entry is the fifth-newest');
    assert.equal(page.entries.includes('E4'), false, 'entries older than 8 must not appear');
});

test('break-active: every visible session may dispatch its own expiry event', async () => {
    // Lite page instances may be reused: onShow must reset the dispatched
    // flag, or the second break would never send BreakElapsed (P1-08).
    const page = (await import('../pages/break-active/index.js')).default;
    page.elapsedDispatched = true;
    page.onShow();
    assert.equal(page.elapsedDispatched, false,
        'onShow must reset elapsedDispatched for the next visible session');
});
