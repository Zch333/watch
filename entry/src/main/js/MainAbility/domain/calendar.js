import { domainError, ERROR_CODES } from './errors.js';
import { err, ok } from './result.js';
import { localDate, weekday } from './values.js';

const WEEKDAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
    const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthLengths[month - 1];
}

export function compareLocalDates(left, right) {
    if (left.year !== right.year) {
        return left.year - right.year;
    }
    if (left.month !== right.month) {
        return left.month - right.month;
    }
    return left.day - right.day;
}

/**
 * Sakamoto weekday algorithm. Returns Weekday domain value.
 * Pure Gregorian math; no system clock.
 */
export function weekdayOf(date) {
    const table = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let year = date.year;
    const month = date.month;
    const day = date.day;
    if (month < 3) {
        year -= 1;
    }
    const index = (year + Math.floor(year / 4) - Math.floor(year / 100) +
        Math.floor(year / 400) + table[month - 1] + day) % 7;
    return weekday(WEEKDAY_NAMES[index]);
}

export function addDays(date, deltaDays) {
    let year = date.year;
    let month = date.month;
    let day = date.day + deltaDays;

    while (day > daysInMonth(year, month)) {
        day -= daysInMonth(year, month);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    while (day < 1) {
        month -= 1;
        if (month < 1) {
            month = 12;
            year -= 1;
        }
        day += daysInMonth(year, month);
    }

    return localDate(year, month, day);
}

export function enumerateDates(startDate, dayCount) {
    if (typeof dayCount !== 'number' || dayCount % 1 !== 0 || dayCount < 0) {
        return err(domainError(ERROR_CODES.INVALID_DATE_RANGE, dayCount));
    }
    const dates = [];
    let current = ok(startDate);
    if (startDate.tag !== 'LocalDate') {
        current = localDate(startDate.year, startDate.month, startDate.day);
        if (current.tag === 'Err') {
            return current;
        }
        current = current.value;
    } else {
        current = startDate;
    }

    for (let index = 0; index < dayCount; index += 1) {
        dates.push(current);
        const next = addDays(current, 1);
        if (next.tag === 'Err') {
            return next;
        }
        current = next.value;
    }
    return ok(Object.freeze(dates));
}

/**
 * Convert Instant to local wall time using a fixed offset minutes from UTC.
 * Domain remains pure: offset is an explicit fact, not a hidden clock.
 */
export function instantToLocal(instantValue, utcOffsetMinutes) {
    if (typeof utcOffsetMinutes !== 'number' || utcOffsetMinutes % 1 !== 0 ||
        utcOffsetMinutes < -14 * 60 || utcOffsetMinutes > 14 * 60) {
        return err(domainError(ERROR_CODES.INVALID_UTC_OFFSET, utcOffsetMinutes));
    }
    const localMs = instantValue.epochMilliseconds + utcOffsetMinutes * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    let dayIndex = Math.floor(localMs / dayMs);
    let minuteOfDayValue = Math.floor((localMs % dayMs) / (60 * 1000));
    if (minuteOfDayValue < 0) {
        minuteOfDayValue += 1440;
        dayIndex -= 1;
    }

    // Civil from days since Unix epoch (1970-01-01 = Thursday)
    let z = dayIndex + 719468;
    const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) -
        Math.floor(doe / 146096)) / 365);
    let year = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const month = mp + (mp < 10 ? 3 : -9);
    year += month <= 2 ? 1 : 0;

    const dateResult = localDate(year, month, day);
    if (dateResult.tag === 'Err') {
        return dateResult;
    }
    return ok(Object.freeze({
        tag: 'LocalWallTime',
        localDate: dateResult.value,
        minuteOfDay: Object.freeze({ tag: 'MinuteOfDay', value: minuteOfDayValue })
    }));
}

export function localToInstant(date, minute, utcOffsetMinutes) {
    if (typeof utcOffsetMinutes !== 'number' || utcOffsetMinutes % 1 !== 0) {
        return err(domainError(ERROR_CODES.INVALID_UTC_OFFSET, utcOffsetMinutes));
    }
    // Days since Unix epoch via civil_from_days inverse
    const year = date.year;
    const month = date.month;
    const day = date.day;
    const y = year - (month <= 2 ? 1 : 0);
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const mp = month + (month > 2 ? -3 : 9);
    const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    const dayIndex = era * 146097 + doe - 719468;
    const localMs = dayIndex * 24 * 60 * 60 * 1000 + minute.value * 60 * 1000;
    const epochMilliseconds = localMs - utcOffsetMinutes * 60 * 1000;
    return ok(Object.freeze({ tag: 'Instant', epochMilliseconds: epochMilliseconds }));
}
