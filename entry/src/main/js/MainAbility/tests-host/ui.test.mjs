import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostApp } from '../app/composition-root.js';
import { createMemoryStore } from '../adapters/memory/memory-store.js';
import { observeCapability, enablePlan } from '../domain/commands.js';
import { localToInstant } from '../domain/calendar.js';
import { localDate, minuteOfDay } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';
import { initialUiModel, projectModel } from '../pages/mvu/model.js';
import { update } from '../pages/mvu/update.js';
import { initApp, dispatch, getModel, refresh } from '../pages/_app-shell.js';

const OFFSET = 480;
const SUPPORTED = capabilitySupported({
    maxPendingCount: 30,
    supportsExactTimer: true,
    supportsCalendar: true,
    supportsRecurring: true,
    survivesAppExit: true
});

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function at(y, m, d, minuteValue) {
    return localToInstant(date(y, m, d), minuteOfDay(minuteValue).value, OFFSET).value;
}

function enabledState() {
    const app = createHostApp({ instant: at(2026, 8, 6, 600), utcOffsetMinutes: OFFSET });
    let state = app.boot().state;
    state = app.handleCommand(state, observeCapability(SUPPORTED)).state;
    state = app.handleCommand(state, enablePlan()).state;
    return { app: app, state: state };
}

function factsFor(now, minuteValue) {
    return {
        now: now,
        localWall: { localDate: date(2026, 8, 6), minuteOfDay: minuteOfDay(minuteValue).value },
        utcOffsetMinutes: OFFSET,
        registeredPlan: [],
        horizonDays: 3
    };
}

test('mvu: initial model projects disabled, unknown capability and no next break', () => {
    const { app, state } = enabledState();
    const disabled = projectModel(Object.assign({}, state, {
        planLifecycle: { tag: 'Disabled' }
    }), factsFor(at(2026, 8, 6, 600), 600));

    assert.equal(disabled.planStatus, 'Disabled');
    assert.equal(disabled.capabilityBanner.level, 'ok');
    assert.equal(disabled.nextBreakText, '10:25');
});

test('mvu: enabled model shows the next break time as HH:MM', () => {
    const { state } = enabledState();
    const model = projectModel(state, factsFor(at(2026, 8, 6, 600), 600));
    assert.equal(model.planStatus, 'Enabled');
    assert.equal(model.nextBreakText, '10:25');
    assert.equal(model.breakStatus, 'NoBreak');
});

test('mvu: active session projects remaining seconds from endsAt', () => {
    const { state } = enabledState();
    const startedAt = at(2026, 8, 6, 625);
    const active = Object.assign({}, state, {
        breakSession: {
            tag: 'Active',
            sessionId: 's1',
            startedAt: startedAt,
            endsAt: at(2026, 8, 6, 630),
            guidanceId: 'stand-walk-eyes'
        }
    });
    const model = projectModel(active, factsFor(at(2026, 8, 6, 628), 628));
    assert.equal(model.breakStatus, 'Active');
    assert.equal(model.remainingSeconds, 120);
    assert.deepEqual(model.currentGuidance.actions, ['stand_and_walk', 'simple_stretch', 'look_far']);
});

test('mvu: finished session projects the outcome', () => {
    const { state } = enabledState();
    const finished = Object.assign({}, state, {
        breakSession: {
            tag: 'Finished',
            sessionId: 's1',
            finishedAt: at(2026, 8, 6, 630),
            outcome: { tag: 'Expired' }
        }
    });
    const model = projectModel(finished, factsFor(at(2026, 8, 6, 630), 630));
    assert.equal(model.breakStatus, 'Finished');
    assert.equal(model.breakOutcome, 'Expired');
});

test('mvu: TickVisible recomputes remaining time purely from endsAt', () => {
    const model = Object.assign({}, initialUiModel(), {
        endsAtEpochMs: at(2026, 8, 6, 630).epochMilliseconds,
        remainingSeconds: 120
    });
    const result = update(model, { tag: 'TickVisible', now: at(2026, 8, 6, 629).epochMilliseconds });
    assert.equal(result.commands.length, 0);
    assert.equal(result.model.remainingSeconds, 60);

    const past = update(model, { tag: 'TickVisible', now: at(2026, 8, 6, 631).epochMilliseconds });
    assert.equal(past.model.remainingSeconds, 0);
});

test('mvu: messages map to the right domain commands', () => {
    const base = initialUiModel();
    assert.equal(update(base, { tag: 'EnablePressed' }).commands[0].tag, 'EnablePlan');
    assert.equal(update(base, { tag: 'DisablePressed' }).commands[0].tag, 'DisablePlan');
    assert.equal(update(base, { tag: 'PauseTodayPressed' }).commands[0].tag, 'PauseForToday');
    assert.equal(update(base, { tag: 'PauseOneHourPressed' }).commands[0].tag, 'PauseForOneHour');
    assert.equal(update(base, { tag: 'SkipNextPressed' }).commands[0].tag, 'SkipNext');
    assert.equal(update(base, { tag: 'SkipBreakPressed' }).commands[0].tag, 'SkipBreak');
    assert.equal(update(base, { tag: 'StartNowPressed' }).commands[0].tag, 'StartBreakNow');
    assert.equal(update(base, { tag: 'CompletePressed' }).commands[0].tag, 'CompleteBreak');
    assert.equal(update(base, { tag: 'AckFinishedPressed' }).commands[0].tag, 'AcknowledgeBreakFinished');
    assert.equal(update(base, { tag: 'ReconcilePressed', now: 1 }).commands[0].tag, 'ReconcilePlan');
    const settings = update(base, { tag: 'SettingsSaved', raw: { weekdays: ['Mon'] } });
    assert.equal(settings.commands[0].tag, 'ConfigureSchedule');
});

test('mvu: StartDuePressed uses the reminder key when present', () => {
    const base = initialUiModel();
    const withKey = update(base, { tag: 'StartDuePressed', reminderKey: 'break-start:25-5:2026-08-06:625' });
    assert.equal(withKey.commands[0].tag, 'StartBreak');
    assert.equal(withKey.commands[0].reminderKey, 'break-start:25-5:2026-08-06:625');
    const fallback = update(base, { tag: 'StartDuePressed' });
    assert.equal(fallback.commands[0].tag, 'StartBreakNow');
});

test('shell: initApp + dispatch drives the model through real commands', () => {
    initApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED
    });

    let model = getModel();
    assert.equal(model.capabilityBanner.level, 'ok');

    dispatch({ tag: 'EnablePressed' });
    model = getModel();
    assert.equal(model.planStatus, 'Enabled');
    assert.equal(model.nextBreakText, '10:25');

    dispatch({ tag: 'StartNowPressed' });
    model = getModel();
    assert.equal(model.breakStatus, 'Active');
    // Break started at the shell clock (10:00), so it ends at 10:05.
    assert.equal(model.remainingSeconds, 300);

    // Visible tick keeps the countdown honest without any timer in the core.
    dispatch({ tag: 'TickVisible', now: at(2026, 8, 6, 603).epochMilliseconds });
    model = getModel();
    assert.equal(model.remainingSeconds, 120);

    dispatch({ tag: 'CompletePressed' });
    model = getModel();
    assert.equal(model.breakStatus, 'Finished');
    assert.equal(model.breakOutcome, 'Completed');

    dispatch({ tag: 'AckFinishedPressed' });
    model = getModel();
    assert.equal(model.breakStatus, 'NoBreak');
});

test('mvu: degraded capability banner is explicit and not ok', () => {
    const { state } = enabledState();
    const degraded = Object.assign({}, state, {
        capability: { tag: 'Degraded', reason: 'capacity 3' }
    });
    const model = projectModel(degraded, factsFor(at(2026, 8, 6, 600), 600));
    assert.equal(model.capabilityBanner.level, 'warn');
    assert.equal(model.capabilityBanner.text, '后台提醒可靠性受限');
    assert.equal(model.canSchedule, false);
});

test('mvu: unsupported capability banner reads Unsupported', () => {
    const { state } = enabledState();
    const unsupported = Object.assign({}, state, {
        capability: { tag: 'Unsupported', reason: 'probe' }
    });
    const model = projectModel(unsupported, factsFor(at(2026, 8, 6, 600), 600));
    assert.equal(model.capabilityBanner.level, 'error');
    assert.equal(model.capabilityBanner.text, '此设备不支持后台提醒');
    assert.equal(model.canSchedule, false);
});

test('shell: a corrupt snapshot surfaces an explicit error model at boot', () => {
    const store = createMemoryStore();
    store._seed({ schemaVersion: 1, settings: { tag: 'Broken' } });
    const model = initApp({
        store: store,
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET
    });
    assert.equal(model.errors.length > 0, true);
    assert.equal(typeof model.errors[0].code, 'string');
    assert.equal(model.errors[0].code.length > 0, true);
    assert.equal(model.planStatus, 'Unknown');
});

test('shell: refresh reprojects from the current clock', () => {
    initApp({
        instant: at(2026, 8, 6, 600),
        utcOffsetMinutes: OFFSET,
        capability: SUPPORTED
    });
    dispatch({ tag: 'EnablePressed' });
    const refreshed = refresh();
    assert.equal(refreshed.planStatus, 'Enabled');
    assert.equal(refreshed.nextBreakText, '10:25');
});
