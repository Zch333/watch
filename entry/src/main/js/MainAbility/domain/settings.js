import { domainError, ERROR_CODES } from './errors.js';
import { err, ok } from './result.js';
import { rhythm, workBlock } from './schedule.js';
import {
    minuteOfDay,
    positiveMinutes,
    schemaVersion,
    weekday
} from './values.js';

const DEFAULT_FOCUS_LIMIT = 180;
const DEFAULT_BREAK_LIMIT = 60;

function hasTag(value, tag) {
    return typeof value === 'object' && value !== null && value.tag === tag;
}

function freezeList(items) {
    return Object.freeze(items.slice());
}

/**
 * Sort work blocks and reject overlaps. Adjacent blocks that only touch
 * at an endpoint are allowed (half-open intervals).
 */
export function normalizeWorkBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return err(domainError(ERROR_CODES.EMPTY_WORK_BLOCKS, blocks));
    }
    for (let index = 0; index < blocks.length; index += 1) {
        if (!hasTag(blocks[index], 'WorkBlock')) {
            return err(domainError(ERROR_CODES.INVALID_WORK_BLOCK, blocks[index]));
        }
    }
    const sorted = blocks.slice().sort(function (left, right) {
        if (left.start.value !== right.start.value) {
            return left.start.value - right.start.value;
        }
        return left.end.value - right.end.value;
    });
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].start.value < sorted[index - 1].end.value) {
            return err(domainError(ERROR_CODES.OVERLAPPING_WORK_BLOCKS, Object.freeze({
                left: sorted[index - 1],
                right: sorted[index]
            })));
        }
    }
    return ok(freezeList(sorted));
}

export function normalizeWeekdays(days) {
    if (!Array.isArray(days) || days.length === 0) {
        return err(domainError(ERROR_CODES.EMPTY_WEEKDAYS, days));
    }
    const unique = [];
    const seen = {};
    for (let index = 0; index < days.length; index += 1) {
        const day = days[index];
        if (!hasTag(day, 'Weekday')) {
            return err(domainError(ERROR_CODES.INVALID_WEEKDAY, day));
        }
        if (!seen[day.value]) {
            seen[day.value] = true;
            unique.push(day);
        }
    }
    const order = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    unique.sort(function (left, right) {
        return order[left.value] - order[right.value];
    });
    return ok(freezeList(unique));
}

export function scheduleSettings(input) {
    if (!input || typeof input !== 'object') {
        return err(domainError(ERROR_CODES.INVALID_SCHEDULE_SETTINGS, input));
    }
    const weekdaysResult = normalizeWeekdays(input.weekdays);
    if (weekdaysResult.tag === 'Err') {
        return weekdaysResult;
    }
    const blocksResult = normalizeWorkBlocks(input.workBlocks);
    if (blocksResult.tag === 'Err') {
        return blocksResult;
    }
    if (!hasTag(input.rhythm, 'Rhythm')) {
        return err(domainError(ERROR_CODES.INVALID_RHYTHM, input.rhythm));
    }
    const versionResult = hasTag(input.version, 'SchemaVersion')
        ? ok(input.version)
        : schemaVersion(input.version || 1);
    if (versionResult.tag === 'Err') {
        return versionResult;
    }
    return ok(Object.freeze({
        tag: 'ScheduleSettings',
        enabledFlag: input.enabledFlag === true,
        weekdays: weekdaysResult.value,
        workBlocks: blocksResult.value,
        rhythm: input.rhythm,
        version: versionResult.value
    }));
}

function requireOk(result, label) {
    if (result.tag !== 'Ok') {
        throw new Error('default settings bootstrap failed at ' + label + ': ' + result.error.code);
    }
    return result.value;
}

/**
 * Product defaults: Mon–Fri, 09:00–12:00 + 13:30–18:00, 25/5.
 * Bootstrap uses throw only for programmer error in constants, never for user input.
 */
export function defaultScheduleSettings() {
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(function (name) {
        return requireOk(weekday(name), name);
    });
    const morning = requireOk(workBlock(
        requireOk(minuteOfDay(9 * 60), 'morning-start'),
        requireOk(minuteOfDay(12 * 60), 'morning-end')
    ), 'morning');
    const afternoon = requireOk(workBlock(
        requireOk(minuteOfDay(13 * 60 + 30), 'afternoon-start'),
        requireOk(minuteOfDay(18 * 60), 'afternoon-end')
    ), 'afternoon');
    const rhythmValue = requireOk(rhythm(
        requireOk(positiveMinutes(25, DEFAULT_FOCUS_LIMIT), 'focus'),
        requireOk(positiveMinutes(5, DEFAULT_BREAK_LIMIT), 'break')
    ), 'rhythm');
    return requireOk(scheduleSettings({
        enabledFlag: false,
        weekdays: weekdays,
        workBlocks: [morning, afternoon],
        rhythm: rhythmValue,
        version: requireOk(schemaVersion(1), 'version')
    }), 'settings');
}

/**
 * Parse raw configure-schedule UI/API input into ScheduleSettings.
 * Collects the first hard error (fail-fast); callers may extend to multi-error later.
 */
export function parseScheduleInput(raw) {
    if (!raw || typeof raw !== 'object') {
        return err(domainError(ERROR_CODES.INVALID_SCHEDULE_SETTINGS, raw));
    }

    const weekdayNames = Array.isArray(raw.weekdays) ? raw.weekdays : null;
    if (weekdayNames === null) {
        return err(domainError(ERROR_CODES.EMPTY_WEEKDAYS, raw.weekdays));
    }
    const weekdays = [];
    for (let index = 0; index < weekdayNames.length; index += 1) {
        const dayResult = weekday(weekdayNames[index]);
        if (dayResult.tag === 'Err') {
            return dayResult;
        }
        weekdays.push(dayResult.value);
    }

    const rawBlocks = Array.isArray(raw.workBlocks) ? raw.workBlocks : null;
    if (rawBlocks === null) {
        return err(domainError(ERROR_CODES.EMPTY_WORK_BLOCKS, raw.workBlocks));
    }
    const blocks = [];
    for (let index = 0; index < rawBlocks.length; index += 1) {
        const rawBlock = rawBlocks[index] || {};
        const startResult = minuteOfDay(rawBlock.start);
        if (startResult.tag === 'Err') {
            return startResult;
        }
        const endResult = minuteOfDay(rawBlock.end);
        if (endResult.tag === 'Err') {
            return endResult;
        }
        const blockResult = workBlock(startResult.value, endResult.value);
        if (blockResult.tag === 'Err') {
            return blockResult;
        }
        blocks.push(blockResult.value);
    }

    const focusLimit = raw.focusLimit || DEFAULT_FOCUS_LIMIT;
    const breakLimit = raw.breakLimit || DEFAULT_BREAK_LIMIT;
    const focusResult = positiveMinutes(raw.focusMinutes, focusLimit);
    if (focusResult.tag === 'Err') {
        return focusResult;
    }
    const breakResult = positiveMinutes(raw.breakMinutes, breakLimit);
    if (breakResult.tag === 'Err') {
        return breakResult;
    }
    const rhythmResult = rhythm(focusResult.value, breakResult.value);
    if (rhythmResult.tag === 'Err') {
        return rhythmResult;
    }

    return scheduleSettings({
        enabledFlag: raw.enabledFlag === true,
        weekdays: weekdays,
        workBlocks: blocks,
        rhythm: rhythmResult.value,
        version: raw.version || 1
    });
}

export const LIMITS = Object.freeze({
    focusMinutes: DEFAULT_FOCUS_LIMIT,
    breakMinutes: DEFAULT_BREAK_LIMIT
});
