import { err, ok } from '../../domain/result.js';
import { instant, localDate, minuteOfDay } from '../../domain/values.js';
import { CALENDAR_ERROR_CODES, calendarError } from '../../ports/calendar-port.js';

function validInstant(value) {
    return value && value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number' &&
        isFinite(value.epochMilliseconds);
}

/**
 * Calendar adapter using the device's actual local timezone rules.
 * Date#getTimezoneOffset is evaluated for each instant, so DST changes do not
 * inherit the offset that happened to be active when the app was launched.
 */
export function createSystemCalendar() {
    return {
        utcOffset(instantValue) {
            if (!validInstant(instantValue)) {
                return err(calendarError(CALENDAR_ERROR_CODES.UNKNOWN_OFFSET, instantValue));
            }
            const date = new Date(instantValue.epochMilliseconds);
            const offset = -date.getTimezoneOffset();
            if (typeof offset !== 'number' || !isFinite(offset)) {
                return err(calendarError(CALENDAR_ERROR_CODES.UNKNOWN_OFFSET, instantValue));
            }
            return ok(offset);
        },

        localWall(instantValue) {
            if (!validInstant(instantValue)) {
                return err(calendarError(CALENDAR_ERROR_CODES.INVALID_LOCAL_TIME, instantValue));
            }
            const date = new Date(instantValue.epochMilliseconds);
            const day = localDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
            const minute = minuteOfDay(date.getHours() * 60 + date.getMinutes());
            if (day.tag === 'Err' || minute.tag === 'Err') {
                return err(calendarError(CALENDAR_ERROR_CODES.INVALID_LOCAL_TIME, {
                    instant: instantValue,
                    dateError: day.error,
                    minuteError: minute.error
                }));
            }
            return ok(Object.freeze({
                localDate: day.value,
                minuteOfDay: minute.value
            }));
        },

        resolve(localDateValue, minuteOfDayValue) {
            if (!localDateValue || localDateValue.tag !== 'LocalDate' ||
                !minuteOfDayValue || minuteOfDayValue.tag !== 'MinuteOfDay') {
                return err(calendarError(CALENDAR_ERROR_CODES.INVALID_LOCAL_TIME, {
                    localDate: localDateValue,
                    minuteOfDay: minuteOfDayValue
                }));
            }
            const hours = Math.floor(minuteOfDayValue.value / 60);
            const minutes = minuteOfDayValue.value % 60;
            const date = new Date(
                localDateValue.year,
                localDateValue.month - 1,
                localDateValue.day,
                hours,
                minutes,
                0,
                0
            );
            // A DST spring-forward gap is normalized by Date. Reject that
            // normalization instead of silently scheduling at another time.
            if (date.getFullYear() !== localDateValue.year ||
                date.getMonth() + 1 !== localDateValue.month ||
                date.getDate() !== localDateValue.day ||
                date.getHours() !== hours ||
                date.getMinutes() !== minutes) {
                return err(calendarError(CALENDAR_ERROR_CODES.INVALID_LOCAL_TIME, {
                    localDate: localDateValue,
                    minuteOfDay: minuteOfDayValue
                }));
            }
            const value = instant(date.getTime());
            if (value.tag === 'Err') {
                return err(calendarError(CALENDAR_ERROR_CODES.INVALID_LOCAL_TIME, value.error));
            }
            return ok(value.value);
        }
    };
}
