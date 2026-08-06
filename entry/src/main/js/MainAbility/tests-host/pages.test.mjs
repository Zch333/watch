import assert from 'node:assert/strict';
import test from 'node:test';

import { initApp, dispatch, getModel } from '../pages/_app-shell.js';
import { update } from '../pages/mvu/update.js';
import { initialUiModel } from '../pages/mvu/model.js';
import { actionLabels } from '../pages/mvu/labels.js';
import { localToInstant } from '../domain/calendar.js';
import { localDate, minuteOfDay } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';

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
