import { domainError, ERROR_CODES } from './errors.js';
import { err, ok } from './result.js';

function hasTag(value, tag) {
    return typeof value === 'object' && value !== null && value.tag === tag;
}

export function rhythm(focusMinutes, breakMinutes) {
    if (!hasTag(focusMinutes, 'PositiveMinutes') || !hasTag(breakMinutes, 'PositiveMinutes')) {
        return err(domainError(ERROR_CODES.INVALID_RHYTHM, Object.freeze({
            focusMinutes: focusMinutes,
            breakMinutes: breakMinutes
        })));
    }
    return ok(Object.freeze({
        tag: 'Rhythm',
        focusMinutes: focusMinutes,
        breakMinutes: breakMinutes
    }));
}

export function workBlock(start, end) {
    const validMinutes = hasTag(start, 'MinuteOfDay') && hasTag(end, 'MinuteOfDay');
    if (!validMinutes || start.value >= end.value) {
        return err(domainError(ERROR_CODES.INVALID_WORK_BLOCK, Object.freeze({
            start: start,
            end: end
        })));
    }
    return ok(Object.freeze({ tag: 'WorkBlock', start: start, end: end }));
}

