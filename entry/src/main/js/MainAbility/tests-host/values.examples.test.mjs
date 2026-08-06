import assert from 'node:assert/strict';
import test from 'node:test';

import {
    instant,
    localDate,
    minuteOfDay,
    positiveMinutes,
    semanticKey
} from '../domain/values.js';
import { rhythm, workBlock } from '../domain/schedule.js';

test('example: smart constructors return tagged immutable values', () => {
    const minute = minuteOfDay(540);
    const date = localDate(2026, 8, 6);

    assert.deepEqual(minute, {
        tag: 'Ok',
        value: { tag: 'MinuteOfDay', value: 540 }
    });
    assert.deepEqual(date, {
        tag: 'Ok',
        value: { tag: 'LocalDate', year: 2026, month: 8, day: 6 }
    });
    assert.equal(Object.isFrozen(minute.value), true);
});

test('example: smart constructors expose expected validation errors', () => {
    assert.equal(minuteOfDay(1440).error.code, 'INVALID_MINUTE_OF_DAY');
    assert.equal(positiveMinutes(0, 120).error.code, 'INVALID_POSITIVE_MINUTES');
    assert.equal(localDate(2025, 2, 29).error.code, 'INVALID_LOCAL_DATE');
    assert.equal(instant(Number.POSITIVE_INFINITY).error.code, 'INVALID_INSTANT');
    assert.equal(semanticKey('').error.code, 'INVALID_SEMANTIC_KEY');
});

test('property: minuteOfDay accepts exactly the integer day-minute range', () => {
    for (let value = -2; value <= 1442; value += 1) {
        const expectedTag = value >= 0 && value < 1440 ? 'Ok' : 'Err';
        assert.equal(minuteOfDay(value).tag, expectedTag);
    }

    assert.equal(minuteOfDay(1.5).tag, 'Err');
});

test('property: localDate implements Gregorian leap-year boundaries without a clock', () => {
    assert.equal(localDate(2000, 2, 29).tag, 'Ok');
    assert.equal(localDate(1900, 2, 29).tag, 'Err');
    assert.equal(localDate(2024, 2, 29).tag, 'Ok');
    assert.equal(localDate(2026, 2, 29).tag, 'Err');
});

test('example: rhythm and workBlock accept only constructed domain values', () => {
    const focus = positiveMinutes(25, 180).value;
    const activity = positiveMinutes(5, 180).value;
    const start = minuteOfDay(540).value;
    const end = minuteOfDay(720).value;

    assert.equal(rhythm(focus, activity).tag, 'Ok');
    assert.equal(workBlock(start, end).tag, 'Ok');
    assert.equal(workBlock(end, start).error.code, 'INVALID_WORK_BLOCK');
});
