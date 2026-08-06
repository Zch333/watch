import { domainError, ERROR_CODES } from './errors.js';
import { err, ok } from './result.js';

const MAX_SAFE_INTEGER = 9007199254740991;
const WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

function isInteger(value) {
    return typeof value === 'number' && value % 1 === 0;
}

function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
    const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthLengths[month - 1];
}

export function minuteOfDay(value) {
    if (!isInteger(value) || value < 0 || value >= 1440) {
        return err(domainError(ERROR_CODES.INVALID_MINUTE_OF_DAY, value));
    }
    return ok(Object.freeze({ tag: 'MinuteOfDay', value: value }));
}

export function positiveMinutes(value, configuredLimit) {
    if (!isInteger(configuredLimit) || configuredLimit < 1) {
        return err(domainError(ERROR_CODES.INVALID_CONFIGURED_LIMIT, configuredLimit));
    }
    if (!isInteger(value) || value < 1 || value > configuredLimit) {
        return err(domainError(ERROR_CODES.INVALID_POSITIVE_MINUTES, Object.freeze({
            value: value,
            configuredLimit: configuredLimit
        })));
    }
    return ok(Object.freeze({ tag: 'PositiveMinutes', value: value }));
}

export function localDate(year, month, day) {
    const validYear = isInteger(year) && year >= 1 && year <= 9999;
    const validMonth = isInteger(month) && month >= 1 && month <= 12;
    const validDay = validMonth && isInteger(day) && day >= 1 && day <= daysInMonth(year, month);

    if (!validYear || !validMonth || !validDay) {
        return err(domainError(ERROR_CODES.INVALID_LOCAL_DATE, Object.freeze({
            year: year,
            month: month,
            day: day
        })));
    }
    return ok(Object.freeze({
        tag: 'LocalDate',
        year: year,
        month: month,
        day: day
    }));
}

export function weekday(value) {
    if (WEEKDAYS.indexOf(value) < 0) {
        return err(domainError(ERROR_CODES.INVALID_WEEKDAY, value));
    }
    return ok(Object.freeze({ tag: 'Weekday', value: value }));
}

export function instant(epochMilliseconds) {
    if (!isInteger(epochMilliseconds) || Math.abs(epochMilliseconds) > MAX_SAFE_INTEGER) {
        return err(domainError(ERROR_CODES.INVALID_INSTANT, epochMilliseconds));
    }
    return ok(Object.freeze({ tag: 'Instant', epochMilliseconds: epochMilliseconds }));
}

export function semanticKey(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return err(domainError(ERROR_CODES.INVALID_SEMANTIC_KEY, value));
    }
    return ok(Object.freeze({ tag: 'SemanticKey', value: value }));
}

export function schemaVersion(value) {
    if (!isInteger(value) || value < 1) {
        return err(domainError(ERROR_CODES.INVALID_SCHEMA_VERSION, value));
    }
    return ok(Object.freeze({ tag: 'SchemaVersion', value: value }));
}

