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
