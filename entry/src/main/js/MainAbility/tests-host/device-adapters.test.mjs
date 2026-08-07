import assert from 'node:assert/strict';
import test from 'node:test';

import { createSystemCalendar } from '../adapters/device/system-calendar.js';
import { createSystemClock } from '../adapters/device/system-clock.js';
import { createUnsupportedReminder } from '../adapters/device/unsupported-reminder.js';
import { instant, localDate, minuteOfDay } from '../domain/values.js';

test('device clock reads a fresh valid instant on every call', () => {
    const clock = createSystemClock();
    const before = Date.now();
    const result = clock.now();
    const after = Date.now();
    assert.equal(result.tag, 'Ok');
    assert.equal(result.value.tag, 'Instant');
    assert.equal(result.value.epochMilliseconds >= before, true);
    assert.equal(result.value.epochMilliseconds <= after, true);
});

test('device calendar round-trips a valid local wall time', () => {
    const calendar = createSystemCalendar();
    const day = localDate(2026, 8, 7).value;
    const minute = minuteOfDay(10 * 60 + 25).value;
    const resolved = calendar.resolve(day, minute);
    assert.equal(resolved.tag, 'Ok');
    const offset = calendar.utcOffset(resolved.value);
    assert.equal(offset.tag, 'Ok');
    const wall = calendar.localWall(resolved.value, offset.value);
    assert.equal(wall.tag, 'Ok');
    assert.deepEqual(wall.value.localDate, day);
    assert.deepEqual(wall.value.minuteOfDay, minute);
});

test('device calendar rejects malformed values instead of normalizing them', () => {
    const calendar = createSystemCalendar();
    assert.equal(calendar.utcOffset({ tag: 'Instant', epochMilliseconds: NaN }).tag, 'Err');
    assert.equal(calendar.resolve({ tag: 'LocalDate', year: 2026, month: 2, day: 30 },
        minuteOfDay(600).value).tag, 'Err');
    assert.equal(calendar.localWall(instant(0).value).tag, 'Ok');
});

test('device reminder reports the Lite capability gap honestly', () => {
    const reminder = createUnsupportedReminder('not in liteWearable SysCaps');
    const probe = reminder.probeCapabilities();
    assert.equal(probe.tag, 'Ok');
    assert.equal(probe.value.tag, 'Unsupported');
    assert.equal(reminder.listRegistered('move25').tag, 'Ok');
    assert.equal(reminder.register({ intents: [] }).error.code, 'UNSUPPORTED');
});
