import { instantToLocal, localToInstant } from '../../domain/calendar.js';
import { ok } from '../../domain/result.js';

/**
 * Fixed-offset CalendarPort adapter built on pure domain Gregorian algebra.
 * The real device adapter will learn the offset from the platform; this one
 * keeps tests deterministic with an explicit offset.
 */
export function createFixedCalendar(utcOffsetMinutes) {
    return {
        utcOffset() {
            return ok(utcOffsetMinutes);
        },
        localWall(instantValue) {
            return instantToLocal(instantValue, utcOffsetMinutes);
        },
        resolve(localDate, minuteOfDayValue) {
            return localToInstant(localDate, minuteOfDayValue, utcOffsetMinutes);
        }
    };
}
