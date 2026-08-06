import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays, enumerateDates, instantToLocal, localToInstant, weekdayOf } from '../domain/calendar.js';
import { localDate, minuteOfDay } from '../domain/values.js';

const OFFSET = 480; // UTC+8

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function minute(value) {
    const result = minuteOfDay(value);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function jsWeekdayName(y, m, d) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

test('example: weekdayOf matches the Gregorian calendar for anchor dates', () => {
    assert.equal(weekdayOf(date(2000, 1, 1)).value.value, 'Sat');
    assert.equal(weekdayOf(date(2024, 2, 29)).value.value, 'Thu');
    assert.equal(weekdayOf(date(2026, 8, 6)).value.value, 'Thu');
});

test('property: weekdayOf agrees with a JS Date oracle across a 4-year span', () => {
    let year = 2022;
    let month = 1;
    let day = 1;
    for (let index = 0; index < 1465; index += 1) {
        const result = weekdayOf(date(year, month, day));
        assert.equal(result.tag, 'Ok');
        assert.equal(result.value.value, jsWeekdayName(year, month, day),
            'mismatch at ' + year + '-' + month + '-' + day);
        day += 1;
        const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
        if (day > max) {
            day = 1;
            month += 1;
            if (month > 12) {
                month = 1;
                year += 1;
            }
        }
    }
});

test('example: addDays crosses month, year and leap boundaries', () => {
    assert.deepEqual(addDays(date(2026, 8, 31), 1).value, date(2026, 9, 1));
    assert.deepEqual(addDays(date(2026, 1, 1), -1).value, date(2025, 12, 31));
    assert.deepEqual(addDays(date(2024, 2, 28), 1).value, date(2024, 2, 29));
    assert.deepEqual(addDays(date(2026, 2, 28), 1).value, date(2026, 3, 1));
});

test('property: addDays is inverse-consistent over a range', () => {
    let current = date(2026, 1, 1);
    for (let delta = 0; delta < 730; delta += 7) {
        const forward = addDays(current, delta);
        assert.equal(forward.tag, 'Ok');
        const backward = addDays(forward.value, -delta);
        assert.equal(backward.tag, 'Ok');
        assert.deepEqual(backward.value, current);
    }
});

test('example: enumerateDates yields contiguous dates', () => {
    const result = enumerateDates(date(2026, 2, 27), 4);
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value, [
        date(2026, 2, 27),
        date(2026, 2, 28),
        date(2026, 3, 1),
        date(2026, 3, 2)
    ]);
    assert.equal(enumerateDates(date(2026, 8, 6), -1).tag, 'Err');
});

test('example: localToInstant and instantToLocal round-trip with fixed offset', () => {
    const d = date(2026, 8, 6);
    const m = minute(625);
    const instantValue = localToInstant(d, m, OFFSET);
    assert.equal(instantValue.tag, 'Ok');
    const wall = instantToLocal(instantValue.value, OFFSET);
    assert.equal(wall.tag, 'Ok');
    assert.deepEqual(wall.value.localDate, d);
    assert.equal(wall.value.minuteOfDay.value, 625);
});

test('property: instantToLocal/localToInstant round-trip across days and offsets', () => {
    for (const offset of [0, 480, -300, 345]) {
        for (let minuteValue = 0; minuteValue < 1440; minuteValue += 61) {
            const d = date(2026, 8, 6);
            const m = minute(minuteValue);
            const to = localToInstant(d, m, offset);
            assert.equal(to.tag, 'Ok');
            const back = instantToLocal(to.value, offset);
            assert.equal(back.tag, 'Ok');
            assert.equal(back.value.minuteOfDay.value, minuteValue);
        }
    }
});

test('example: instantToLocal converts an instant across a UTC day boundary', () => {
    // 2026-08-06 00:30 UTC+8 == 2026-08-05 16:30 UTC
    const d = date(2026, 8, 6);
    const m = minute(30);
    const instantValue = localToInstant(d, m, OFFSET).value;
    const utc = instantToLocal(instantValue, 0);
    assert.equal(utc.tag, 'Ok');
    assert.deepEqual(utc.value.localDate, date(2026, 8, 5));
    assert.equal(utc.value.minuteOfDay.value, 16 * 60 + 30);
});
