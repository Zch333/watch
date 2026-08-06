/**
 * CalendarPort/v1
 *
 * Contract: converts instants to local wall time and back, plus the UTC offset.
 * The domain uses pure Gregorian algebra with an explicit offset; this port is
 * the only place that learns the device's timezone policy.
 *
 * utcOffset(instant) -> Result<CalendarError, number>           // minutes east of UTC
 * localWall(instant) -> Result<CalendarError, LocalWallTime>    // { localDate, minuteOfDay }
 * resolve(localDate, minuteOfDay) -> Result<CalendarError, Instant>
 *
 * - Unknown timezone policy must return an explicit error, never a guess.
 * - DST jumps are reported by the adapter; the domain only receives results.
 */

export const CALENDAR_ERROR_CODES = Object.freeze({
    UNKNOWN_OFFSET: 'UNKNOWN_OFFSET',
    INVALID_LOCAL_TIME: 'INVALID_LOCAL_TIME'
});

export function calendarError(code, details) {
    return Object.freeze({
        tag: 'CalendarError',
        code: code,
        details: details
    });
}
