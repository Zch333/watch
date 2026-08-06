import assert from 'node:assert/strict';
import test from 'node:test';

import { evolveAll } from '../domain/evolve.js';
import { initialDomainState } from '../domain/model.js';
import {
    createSnapshot,
    CURRENT_SCHEMA_VERSION,
    freshSnapshot,
    migrateSnapshot,
    rehydrateFromRaw,
    stateFromSnapshot
} from '../domain/snapshot.js';
import { capabilitySupported, breakActiveState } from '../domain/state.js';
import { localDate, minuteOfDay, instant } from '../domain/values.js';

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

test('example: createSnapshot serializes domain state with schema version', () => {
    const state = initialDomainState();
    const snapshot = createSnapshot(state);
    assert.equal(snapshot.tag, 'Snapshot');
    assert.equal(snapshot.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(snapshot.settings.tag, 'ScheduleSettings');
    assert.equal(snapshot.planLifecycle.tag, 'Disabled');
});

test('example: snapshot round-trips through migrate and stateFromSnapshot', () => {
    let state = initialDomainState();
    state = evolveAll(state, [
        {
            tag: 'CapabilityObserved',
            capability: capabilitySupported({ maxPendingCount: 10 })
        }
    ]).value;
    state = Object.assign({}, state, {
        pause: { tag: 'PauseThroughLocal', localDate: date(2026, 8, 6), minuteOfDay: minuteOfDay(720).value },
        breakSession: breakActiveState('s1', instant(1).value, instant(2).value, 'stand-walk-eyes'),
        guidanceIndex: 3,
        revision: 7
    });

    const snapshot = createSnapshot(state);
    const migrated = migrateSnapshot(snapshot);
    assert.equal(migrated.tag, 'Ok');
    const restored = stateFromSnapshot(migrated.value);

    assert.equal(restored.capability.tag, 'Supported');
    assert.equal(restored.pause.tag, 'PauseThroughLocal');
    assert.equal(restored.pause.minuteOfDay.value, 720);
    assert.equal(restored.breakSession.tag, 'Active');
    assert.equal(restored.breakSession.guidanceId, 'stand-walk-eyes');
    assert.equal(restored.guidanceIndex, 3);
    assert.equal(restored.revision, 7);
    assert.equal(restored.settings.rhythm.focusMinutes.value, 25);
});

test('example: JSON round-trip preserves all tagged fields', () => {
    const state = initialDomainState();
    const snapshot = createSnapshot(state);
    const raw = JSON.parse(JSON.stringify(snapshot));
    const migrated = migrateSnapshot(raw);
    assert.equal(migrated.tag, 'Ok');
    const restored = stateFromSnapshot(migrated.value);
    assert.deepEqual(restored.settings, state.settings);
    assert.deepEqual(restored.planLifecycle, state.planLifecycle);
});

test('example: null raw snapshot yields fresh defaults', () => {
    const migrated = migrateSnapshot(null);
    assert.equal(migrated.tag, 'Ok');
    assert.equal(migrated.value.settings.enabledFlag, false);
    assert.equal(migrated.value.planLifecycle.tag, 'Disabled');
});

test('example: corrupt snapshots fail explicitly without silent reset', () => {
    const missingSettings = migrateSnapshot({
        schemaVersion: 1,
        planLifecycle: { tag: 'Enabled' }
    });
    assert.equal(missingSettings.tag, 'Err');
    assert.equal(missingSettings.error.code, 'INVALID_SNAPSHOT');

    const invalidVersion = migrateSnapshot({ schemaVersion: 99, settings: {} });
    assert.equal(invalidVersion.tag, 'Err');
    assert.equal(invalidVersion.error.code, 'UNSUPPORTED_SCHEMA_VERSION');

    const missingVersion = migrateSnapshot({ settings: {} });
    assert.equal(missingVersion.tag, 'Err');
    assert.equal(missingVersion.error.code, 'INVALID_SNAPSHOT');

    const overlappingBlocks = migrateSnapshot({
        schemaVersion: 1,
        settings: {
            weekdays: [{ tag: 'Weekday', value: 'Mon' }],
            workBlocks: [
                { tag: 'WorkBlock', start: { tag: 'MinuteOfDay', value: 540 }, end: { tag: 'MinuteOfDay', value: 720 } },
                { tag: 'WorkBlock', start: { tag: 'MinuteOfDay', value: 600 }, end: { tag: 'MinuteOfDay', value: 780 } }
            ],
            rhythm: {
                tag: 'Rhythm',
                focusMinutes: { tag: 'PositiveMinutes', value: 25 },
                breakMinutes: { tag: 'PositiveMinutes', value: 5 }
            },
            version: { tag: 'SchemaVersion', value: 1 }
        }
    });
    assert.equal(overlappingBlocks.tag, 'Err');
    assert.equal(overlappingBlocks.error.code, 'OVERLAPPING_WORK_BLOCKS');
});

test('example: rehydrateFromRaw is the full load path', () => {
    const state = initialDomainState();
    const raw = JSON.parse(JSON.stringify(createSnapshot(state)));
    const result = rehydrateFromRaw(raw);
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.settings.enabledFlag, false);
});

test('example: freshSnapshot is an explicit reset path', () => {
    const snapshot = freshSnapshot();
    assert.equal(snapshot.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(snapshot.planLifecycle.tag, 'Disabled');
    assert.equal(snapshot.settings.rhythm.focusMinutes.value, 25);
});

test('example: unknown lifecycle/session tags fail strict decode', () => {
    const raw = {
        schemaVersion: 1,
        settings: {
            weekdays: [{ tag: 'Weekday', value: 'Mon' }],
            workBlocks: [
                { tag: 'WorkBlock', start: { tag: 'MinuteOfDay', value: 540 }, end: { tag: 'MinuteOfDay', value: 720 } }
            ],
            rhythm: {
                tag: 'Rhythm',
                focusMinutes: { tag: 'PositiveMinutes', value: 25 },
                breakMinutes: { tag: 'PositiveMinutes', value: 5 }
            },
            version: { tag: 'SchemaVersion', value: 1 }
        },
        planLifecycle: { tag: 'Mystery' },
        breakSession: { tag: 'NoBreak' },
        pause: { tag: 'NoPause' },
        skip: { tag: 'NoSkip' },
        capability: { tag: 'Unknown' }
    };
    const migrated = migrateSnapshot(raw);
    assert.equal(migrated.tag, 'Err');
    assert.equal(migrated.error.code, 'INVALID_SNAPSHOT');
    assert.equal(migrated.error.details.reason, 'unknown_plan_lifecycle_tag');
});

test('example: invalid nested values fail strict decode', () => {
    const raw = {
        schemaVersion: 1,
        settings: {
            weekdays: [{ tag: 'Weekday', value: 'Mon' }],
            workBlocks: [
                { tag: 'WorkBlock', start: { tag: 'MinuteOfDay', value: 540 }, end: { tag: 'MinuteOfDay', value: 720 } }
            ],
            rhythm: {
                tag: 'Rhythm',
                focusMinutes: { tag: 'PositiveMinutes', value: 25 },
                breakMinutes: { tag: 'PositiveMinutes', value: 5 }
            },
            version: { tag: 'SchemaVersion', value: 1 }
        },
        planLifecycle: { tag: 'Paused', until: { tag: 'NotAnInstant' } },
        breakSession: { tag: 'NoBreak' },
        pause: { tag: 'NoPause' },
        skip: { tag: 'NoSkip' },
        capability: { tag: 'Unknown' }
    };
    const migrated = migrateSnapshot(raw);
    assert.equal(migrated.tag, 'Err');
    assert.equal(migrated.error.code, 'INVALID_SNAPSHOT');
    assert.equal(migrated.error.details.reason, 'invalid_paused_until');
});

test('example: a spoofed ScheduleSettings tag never bypasses validation', () => {
    // The object declares itself a valid ScheduleSettings, but the nested
    // weekday is not a real weekday: strict decode must rebuild the settings
    // through the smart constructor instead of trusting the tag (P1-02).
    const raw = {
        schemaVersion: 1,
        revision: 0,
        settings: {
            tag: 'ScheduleSettings',
            enabledFlag: false,
            weekdays: [{ tag: 'Weekday', value: 'InvalidDay' }],
            workBlocks: [
                { tag: 'WorkBlock', start: { tag: 'MinuteOfDay', value: 540 }, end: { tag: 'MinuteOfDay', value: 720 } }
            ],
            rhythm: {
                tag: 'Rhythm',
                focusMinutes: { tag: 'PositiveMinutes', value: 25 },
                breakMinutes: { tag: 'PositiveMinutes', value: 5 }
            },
            version: { tag: 'SchemaVersion', value: 1 }
        }
    };
    const rehydrated = rehydrateFromRaw(raw);
    assert.equal(rehydrated.tag, 'Err');
    assert.equal(rehydrated.error.code, 'INVALID_WEEKDAY');
});

test('example: non-integer revision and guidanceIndex fail strict decode', () => {
    const base = JSON.parse(JSON.stringify(createSnapshot(initialDomainState())));

    const floatRevision = Object.assign({}, base, { revision: 1.5 });
    const badRevision = migrateSnapshot(floatRevision);
    assert.equal(badRevision.tag, 'Err');
    assert.equal(badRevision.error.code, 'INVALID_SNAPSHOT');
    assert.equal(badRevision.error.details.reason, 'invalid_revision');

    const negativeGuidance = Object.assign({}, base, { guidanceIndex: -1 });
    const badGuidance = migrateSnapshot(negativeGuidance);
    assert.equal(badGuidance.tag, 'Err');
    assert.equal(badGuidance.error.code, 'INVALID_SNAPSHOT');
    assert.equal(badGuidance.error.details.reason, 'invalid_guidance_index');
});

test('example: an Active session whose endsAt is not after startedAt fails decode', () => {
    const base = JSON.parse(JSON.stringify(createSnapshot(initialDomainState())));
    const raw = Object.assign({}, base, {
        breakSession: {
            tag: 'Active',
            sessionId: 's1',
            startedAt: { tag: 'Instant', epochMilliseconds: 1000 },
            endsAt: { tag: 'Instant', epochMilliseconds: 1000 },
            guidanceId: 'stand-walk-eyes'
        }
    });
    const migrated = migrateSnapshot(raw);
    assert.equal(migrated.tag, 'Err');
    assert.equal(migrated.error.code, 'INVALID_SNAPSHOT');
    assert.equal(migrated.error.details.reason, 'invalid_break_active_interval');

    const missingSessionId = Object.assign({}, base, {
        breakSession: {
            tag: 'Active',
            startedAt: { tag: 'Instant', epochMilliseconds: 1000 },
            endsAt: { tag: 'Instant', epochMilliseconds: 2000 },
            guidanceId: 'stand-walk-eyes'
        }
    });
    const noId = migrateSnapshot(missingSessionId);
    assert.equal(noId.tag, 'Err');
    assert.equal(noId.error.details.reason, 'invalid_break_active_fields');
});

test('example: a spoofed PauseThroughLocal with an invalid date fails decode', () => {
    const base = JSON.parse(JSON.stringify(createSnapshot(initialDomainState())));
    const raw = Object.assign({}, base, {
        pause: {
            tag: 'PauseThroughLocal',
            localDate: { tag: 'LocalDate', year: 2026, month: 13, day: 1 },
            minuteOfDay: { tag: 'MinuteOfDay', value: 720 }
        }
    });
    const migrated = migrateSnapshot(raw);
    assert.equal(migrated.tag, 'Err');
    assert.equal(migrated.error.code, 'INVALID_SNAPSHOT');
    assert.equal(migrated.error.details.reason, 'invalid_pause_through_local');
});
