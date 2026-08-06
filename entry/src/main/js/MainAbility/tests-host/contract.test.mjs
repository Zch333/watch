import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryStore } from '../adapters/memory/memory-store.js';
import { createFixedClock } from '../adapters/memory/fixed-clock.js';
import { createFixedCalendar } from '../adapters/memory/fixed-calendar.js';
import { createRecordingReminder } from '../adapters/memory/recording-reminder.js';
import { createMemoryHaptics } from '../adapters/memory/memory-haptics.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';
import { createRecordingNavigation } from '../adapters/memory/recording-navigation.js';
import { none, some } from '../domain/option.js';
import { instant } from '../domain/values.js';
import { capabilitySupported } from '../domain/state.js';
import { createSnapshot } from '../domain/snapshot.js';
import { initialDomainState } from '../domain/model.js';

function intent(keyText, atMinute) {
    return Object.freeze({
        tag: 'BreakStart',
        key: Object.freeze({ tag: 'SemanticKey', value: keyText }),
        localDate: Object.freeze({ tag: 'LocalDate', year: 2026, month: 8, day: 6 }),
        at: Object.freeze({ tag: 'MinuteOfDay', value: atMinute })
    });
}

test('contract/store: load is None before first save and round-trips after', () => {
    const store = createMemoryStore();
    const loaded = store.loadSnapshot();
    assert.equal(loaded.tag, 'Ok');
    assert.deepEqual(loaded.value, none());

    const snapshot = createSnapshot(initialDomainState());
    const saved = store.saveSnapshot(0, snapshot);
    assert.equal(saved.tag, 'Ok');
    assert.equal(saved.value.value, snapshot.revision);

    const again = store.loadSnapshot();
    assert.equal(again.tag, 'Ok');
    assert.equal(again.value.tag, 'Some');
    assert.equal(again.value.value.revision, snapshot.revision);
});

test('contract/store: concurrent modification is rejected, IO failure surfaces', () => {
    const store = createMemoryStore();
    const snapshot = createSnapshot(initialDomainState());
    assert.equal(store.saveSnapshot(5, snapshot).error.code, 'CONCURRENT_MODIFICATION');
    assert.equal(store.saveSnapshot(0, snapshot).tag, 'Ok');

    store._failNextSave();
    const next = createSnapshot(Object.assign({}, initialDomainState(), { revision: 1 }));
    const failed = store.saveSnapshot(snapshot.revision, next);
    assert.equal(failed.tag, 'Err');
    assert.equal(failed.error.code, 'IO_FAILURE');
    // Previous valid snapshot remains readable.
    assert.equal(store.loadSnapshot().value.value.revision, snapshot.revision);
});

test('contract/clock: fixed clock returns the configured instant and advances', () => {
    const start = instant(12345).value;
    const clock = createFixedClock(start);
    assert.equal(clock.now().value.epochMilliseconds, 12345);
    const advanced = clock.advance(60000);
    assert.equal(advanced.epochMilliseconds, 12345 + 60000);
    assert.equal(clock.now().value.epochMilliseconds, 12345 + 60000);
});

test('contract/calendar: fixed calendar resolves and converts consistently', () => {
    const calendar = createFixedCalendar(480);
    const d = { tag: 'LocalDate', year: 2026, month: 8, day: 6 };
    const m = { tag: 'MinuteOfDay', value: 600 };
    const resolved = calendar.resolve(d, m);
    assert.equal(resolved.tag, 'Ok');
    const wall = calendar.localWall(resolved.value);
    assert.equal(wall.tag, 'Ok');
    assert.deepEqual(wall.value.localDate, d);
    assert.equal(wall.value.minuteOfDay.value, 600);
    assert.equal(calendar.utcOffset().value, 480);
});

test('contract/reminder: register is idempotent by semantic key', () => {
    const adapter = createRecordingReminder({ capability: capabilitySupported({ maxPendingCount: 30 }) });
    const a = intent('k-1', 565);
    const first = adapter.register([a]);
    assert.equal(first.tag, 'Ok');
    const second = adapter.register([a]);
    assert.equal(second.tag, 'Ok');
    assert.equal(second.value.registered.length, 1);
    assert.equal(adapter.listRegistered('move25').value.length, 1);
    // Same system id preserved across re-register
    assert.equal(first.value.registered[0].systemId, second.value.registered[0].systemId);
});

test('contract/reminder: re-registering a key reschedules its absolute due time', () => {
    const adapter = createRecordingReminder({ capability: capabilitySupported({ maxPendingCount: 30 }) });
    const base = intent('k-1', 565);
    const atT1 = Object.assign({}, base, { dueAt: instant(1000).value });
    const atT2 = Object.assign({}, base, { dueAt: instant(2000).value });

    const first = adapter.register([atT1]);
    assert.equal(first.tag, 'Ok');
    const second = adapter.register([atT2]);
    assert.equal(second.tag, 'Ok');

    // Still exactly one system reminder and a stable system id.
    assert.equal(second.value.registered.length, 1);
    assert.equal(adapter.listRegistered('move25').value.length, 1);
    assert.equal(first.value.registered[0].systemId, second.value.registered[0].systemId);

    // listRegistered reflects the rescheduled absolute time.
    const listed = adapter.listRegistered().value[0];
    assert.equal(listed.dueAt.tag, 'Instant');
    assert.equal(listed.dueAt.epochMilliseconds, 2000);
});

test('contract/reminder: partial failure is reported per key', () => {
    const adapter = createRecordingReminder({
        capability: capabilitySupported({ maxPendingCount: 30 }),
        failKeys: ['k-bad']
    });
    const result = adapter.register([intent('k-ok', 565), intent('k-bad', 595)]);
    assert.equal(result.tag, 'Err');
    assert.equal(result.error.code, 'PARTIAL_FAILURE');
    assert.equal(result.error.details.registered.length, 1);
    assert.equal(result.error.details.failed.length, 1);
    assert.equal(result.error.details.failed[0].key, 'k-bad');
    // Successful keys are still registered.
    assert.deepEqual(
        adapter.listRegistered('move25').value.map(function (intent) {
            return intent.key.value;
        }),
        ['k-ok']
    );
});

test('contract/reminder: cancel removes only requested keys and reports missing', () => {
    const adapter = createRecordingReminder({ capability: capabilitySupported({ maxPendingCount: 30 }) });
    adapter.register([intent('k-1', 565), intent('k-2', 595)]);
    const result = adapter.cancel(['k-1', 'k-nope']);
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.cancelled, ['k-1']);
    assert.deepEqual(result.value.missing, ['k-nope']);
    assert.deepEqual(
        adapter.listRegistered('move25').value.map(function (intent) {
            return intent.key.value;
        }),
        ['k-2']
    );
});

test('contract/reminder: probe surfaces Unsupported without guessing', () => {
    const supported = createRecordingReminder({ capability: capabilitySupported({ maxPendingCount: 30 }) });
    assert.equal(supported.probeCapabilities().value.tag, 'Supported');

    const unsupported = createRecordingReminder({ capability: { tag: 'Unsupported', reason: 'probe' } });
    assert.equal(unsupported.probeCapabilities().tag, 'Err');
    assert.equal(unsupported.probeCapabilities().error.code, 'UNSUPPORTED');

    const unknown = createRecordingReminder({ capability: { tag: 'Unknown' } });
    assert.equal(unknown.probeCapabilities().value.tag, 'Unknown');
});

test('contract/haptics: records every requested pattern', () => {
    const haptics = createMemoryHaptics();
    assert.equal(haptics.vibrate('BreakStart').tag, 'Ok');
    assert.equal(haptics.vibrate('BreakEnd').tag, 'Ok');
    assert.deepEqual(haptics._patterns(), ['BreakStart', 'BreakEnd']);
});

test('contract/diagnostics: append and readRecent are newest-first with a cap', () => {
    const diagnostics = createMemoryDiagnostics({ capacity: 3 });
    diagnostics.append({ tag: 'A', at: 1 });
    diagnostics.append({ tag: 'B', at: 2 });
    diagnostics.append({ tag: 'C', at: 3 });
    diagnostics.append({ tag: 'D', at: 4 });
    const recent = diagnostics.readRecent(10);
    assert.equal(recent.tag, 'Ok');
    assert.deepEqual(recent.value.map(function (e) {
        return e.tag;
    }), ['D', 'C', 'B']);
    // The ring is capped: readRecent(10) still returns only the capacity.
    assert.equal(diagnostics.readRecent(10).value.length, 3);
});

test('contract/store: readStatus reports revision and presence through the port', () => {
    const store = createMemoryStore();
    const before = store.readStatus();
    assert.equal(before.tag, 'Ok');
    assert.equal(before.value.hasSnapshot, false);
    assert.equal(before.value.revision, 0);

    const snapshot = createSnapshot(initialDomainState());
    assert.equal(store.saveSnapshot(0, snapshot).tag, 'Ok');
    const after = store.readStatus();
    assert.equal(after.value.hasSnapshot, true);
    assert.equal(after.value.revision, snapshot.revision);
});

test('contract/navigation: routes are recorded in order', () => {
    const navigation = createRecordingNavigation();
    navigation.navigate('home');
    navigation.navigate('break-due');
    assert.deepEqual(navigation._routes(), ['home', 'break-due']);
});
