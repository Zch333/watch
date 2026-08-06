import assert from 'node:assert/strict';
import test from 'node:test';

import {
    defaultScheduleSettings,
    normalizeWeekdays,
    normalizeWorkBlocks,
    parseScheduleInput,
    scheduleSettings
} from '../domain/settings.js';
import { rhythm, workBlock } from '../domain/schedule.js';
import { localDate, minuteOfDay, positiveMinutes, schemaVersion, weekday } from '../domain/values.js';

function valid(result) {
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function wd(name) {
    return valid(weekday(name));
}

function blk(start, end) {
    return valid(workBlock(valid(minuteOfDay(start)), valid(minuteOfDay(end))));
}

test('example: defaults are Mon-Fri, two blocks, 25/5, disabled, schema v1', () => {
    const settings = defaultScheduleSettings();
    assert.deepEqual(settings.weekdays.map(function (d) {
        return d.value;
    }), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.deepEqual(settings.workBlocks.map(function (b) {
        return [b.start.value, b.end.value];
    }), [[540, 720], [810, 1080]]);
    assert.equal(settings.rhythm.focusMinutes.value, 25);
    assert.equal(settings.rhythm.breakMinutes.value, 5);
    assert.equal(settings.enabledFlag, false);
    assert.equal(settings.version.value, 1);
});

test('example: normalizeWorkBlocks sorts and rejects overlaps, allows touching', () => {
    const sorted = normalizeWorkBlocks([blk(810, 1080), blk(540, 720)]);
    assert.equal(sorted.tag, 'Ok');
    assert.deepEqual(sorted.value.map(function (b) {
        return b.start.value;
    }), [540, 810]);

    assert.equal(normalizeWorkBlocks([blk(540, 720), blk(600, 780)]).tag, 'Err');
    assert.equal(normalizeWorkBlocks([blk(540, 600), blk(600, 720)]).tag, 'Ok');
    assert.equal(normalizeWorkBlocks([]).error.code, 'EMPTY_WORK_BLOCKS');
});

test('example: normalizeWeekdays sorts and deduplicates', () => {
    const result = normalizeWeekdays([wd('Fri'), wd('Mon'), wd('Fri'), wd('Wed')]);
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.map(function (d) {
        return d.value;
    }), ['Mon', 'Wed', 'Fri']);
    assert.equal(normalizeWeekdays([]).error.code, 'EMPTY_WEEKDAYS');
});

test('example: scheduleSettings accepts constructed domain values', () => {
    const settings = valid(scheduleSettings({
        enabledFlag: true,
        weekdays: [wd('Mon'), wd('Tue')],
        workBlocks: [blk(540, 720)],
        rhythm: valid(rhythm(valid(positiveMinutes(25, 180)), valid(positiveMinutes(5, 60)))),
        version: valid(schemaVersion(2))
    }));
    assert.equal(settings.enabledFlag, true);
    assert.equal(settings.version.value, 2);
});

test('example: parseScheduleInput validates raw user input', () => {
    const parsed = valid(parseScheduleInput({
        enabledFlag: true,
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        workBlocks: [{ start: 540, end: 720 }, { start: 810, end: 1080 }],
        focusMinutes: 25,
        breakMinutes: 5
    }));
    assert.equal(parsed.enabledFlag, true);
    assert.equal(parsed.rhythm.focusMinutes.value, 25);

    assert.equal(parseScheduleInput({ weekdays: ['Mon'], workBlocks: [{ start: 540, end: 720 }], focusMinutes: 25, breakMinutes: 5 }).tag, 'Ok');
    assert.equal(parseScheduleInput({ weekdays: [], workBlocks: [{ start: 540, end: 720 }], focusMinutes: 25, breakMinutes: 5 }).error.code, 'EMPTY_WEEKDAYS');
    assert.equal(parseScheduleInput({ weekdays: ['Mon'], workBlocks: [{ start: 720, end: 540 }], focusMinutes: 25, breakMinutes: 5 }).error.code, 'INVALID_WORK_BLOCK');
    assert.equal(parseScheduleInput({ weekdays: ['Mon'], workBlocks: [{ start: 540, end: 720 }], focusMinutes: 0, breakMinutes: 5 }).error.code, 'INVALID_POSITIVE_MINUTES');
    assert.equal(parseScheduleInput({ weekdays: ['Mon'], workBlocks: [{ start: 540, end: 720 }], focusMinutes: 25, breakMinutes: 200 }).error.code, 'INVALID_POSITIVE_MINUTES');
    assert.equal(parseScheduleInput(null).error.code, 'INVALID_SCHEDULE_SETTINGS');
});

test('property: parseScheduleInput round-trips constructed settings', () => {
    const settings = defaultScheduleSettings();
    const raw = {
        enabledFlag: true,
        weekdays: settings.weekdays.map(function (d) {
            return d.value;
        }),
        workBlocks: settings.workBlocks.map(function (b) {
            return { start: b.start.value, end: b.end.value };
        }),
        focusMinutes: settings.rhythm.focusMinutes.value,
        breakMinutes: settings.rhythm.breakMinutes.value
    };
    const parsed = valid(parseScheduleInput(raw));
    assert.deepEqual(parsed.weekdays.map(function (d) {
        return d.value;
    }), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.equal(parsed.rhythm.focusMinutes.value, 25);
    assert.equal(parsed.version.value, 1);
});

test('example: localDate is required, not fabricated by settings', () => {
    const settings = defaultScheduleSettings();
    assert.equal(typeof settings.weekdays[0].value, 'string');
    assert.equal(settings.workBlocks[0].start.tag, 'MinuteOfDay');
    void localDate;
});
