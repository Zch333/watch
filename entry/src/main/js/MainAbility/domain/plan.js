import { compareLocalDates, localToInstant, weekdayOf } from './calendar.js';
import { semanticKey } from './values.js';
import { err, ok } from './result.js';
import { domainError, ERROR_CODES } from './errors.js';

function pad(value, length) {
    let text = String(value);
    while (text.length < length) {
        text = '0' + text;
    }
    return text;
}

function dateText(date) {
    return pad(date.year, 4) + '-' + pad(date.month, 2) + '-' + pad(date.day, 2);
}

function compareDates(left, right) {
    return compareLocalDates(left, right);
}

function compareIntents(left, right) {
    const dateOrder = compareDates(left.localDate, right.localDate);
    if (dateOrder !== 0) {
        return dateOrder;
    }
    if (left.at.value !== right.at.value) {
        return left.at.value - right.at.value;
    }
    if (left.key.value < right.key.value) {
        return -1;
    }
    if (left.key.value > right.key.value) {
        return 1;
    }
    return 0;
}

function compareCanonical(left, right) {
    if (left.key.value < right.key.value) {
        return -1;
    }
    if (left.key.value > right.key.value) {
        return 1;
    }
    return compareIntents(left, right);
}

function freezePlan(intents) {
    return Object.freeze(intents);
}

function breakStartIntent(date, at, rhythmValue) {
    const rhythmVersion = rhythmValue.focusMinutes.value + '-' + rhythmValue.breakMinutes.value;
    const keyText = 'break-start:' + rhythmVersion + ':' + dateText(date) + ':' + at.value;
    return Object.freeze({
        tag: 'BreakStart',
        key: semanticKey(keyText).value,
        localDate: date,
        at: at
    });
}

function minuteValue(value) {
    return Object.freeze({ tag: 'MinuteOfDay', value: value });
}

export function generateBlockPlan(date, block, rhythmValue) {
    const intents = [];
    const cycleMinutes = rhythmValue.focusMinutes.value + rhythmValue.breakMinutes.value;
    let cycleStart = block.start.value;

    while (cycleStart + rhythmValue.focusMinutes.value <= block.end.value) {
        const breakStart = minuteValue(cycleStart + rhythmValue.focusMinutes.value);
        intents.push(breakStartIntent(date, breakStart, rhythmValue));
        cycleStart += cycleMinutes;
    }

    return freezePlan(intents);
}

export function generateDayPlan(date, workBlocks, rhythmValue) {
    let plan = freezePlan([]);
    const blocks = workBlocks || [];
    for (let index = 0; index < blocks.length; index += 1) {
        plan = combinePlans(plan, generateBlockPlan(date, blocks[index], rhythmValue));
    }
    return plan;
}

function weekdayEnabled(settings, date) {
    const dayResult = weekdayOf(date);
    if (dayResult.tag === 'Err') {
        return false;
    }
    const name = dayResult.value.value;
    for (let index = 0; index < settings.weekdays.length; index += 1) {
        if (settings.weekdays[index].value === name) {
            return true;
        }
    }
    return false;
}

/**
 * Generate plan over an explicit list of LocalDate values using schedule settings.
 */
export function generateRangePlan(dates, settings) {
    let plan = freezePlan([]);
    const list = dates || [];
    for (let index = 0; index < list.length; index += 1) {
        const date = list[index];
        if (!weekdayEnabled(settings, date)) {
            continue;
        }
        plan = combinePlans(plan, generateDayPlan(date, settings.workBlocks, settings.rhythm));
    }
    return plan;
}

/**
 * First intent strictly after the given local wall time, or undefined.
 */
export function firstFutureIntent(plan, localDateValue, minuteOfDayValue) {
    for (let index = 0; index < plan.length; index += 1) {
        const intent = plan[index];
        const dateOrder = compareDates(intent.localDate, localDateValue);
        if (dateOrder > 0) {
            return intent;
        }
        if (dateOrder === 0 && intent.at.value > minuteOfDayValue.value) {
            return intent;
        }
    }
    return undefined;
}

export function findIntentByKey(plan, keyValue) {
    for (let index = 0; index < plan.length; index += 1) {
        if (plan[index].key.value === keyValue) {
            return plan[index];
        }
    }
    return undefined;
}

export function emptyPlan() {
    return freezePlan([]);
}

export function combinePlans(left, right) {
    const candidates = left.concat(right).slice().sort(compareCanonical);
    const unique = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const previous = unique.length === 0 ? undefined : unique[unique.length - 1];
        if (previous === undefined || previous.key.value !== candidates[index].key.value) {
            unique.push(candidates[index]);
        }
    }

    return freezePlan(unique.sort(compareIntents));
}

export function noPause() {
    return Object.freeze({ tag: 'NoPause' });
}

export function pauseThroughLocal(date, minute) {
    return Object.freeze({ tag: 'PauseThroughLocal', localDate: date, minuteOfDay: minute });
}

export function noSkip() {
    return Object.freeze({ tag: 'NoSkip' });
}

export function skipReminder(key) {
    return Object.freeze({ tag: 'SkipReminder', reminderKey: key });
}

function isAtOrBeforePause(intent, pause) {
    if (pause.tag === 'NoPause') {
        return false;
    }
    const dateOrder = compareDates(intent.localDate, pause.localDate);
    return dateOrder < 0 || (dateOrder === 0 && intent.at.value <= pause.minuteOfDay.value);
}

export function applySuppression(plan, pause, skip) {
    const remaining = [];
    let skipped = false;

    for (let index = 0; index < plan.length; index += 1) {
        const intent = plan[index];
        if (isAtOrBeforePause(intent, pause)) {
            continue;
        }
        if (!skipped && skip.tag === 'SkipReminder' && intent.key.value === skip.reminderKey.value) {
            skipped = true;
            continue;
        }
        remaining.push(intent);
    }

    return freezePlan(remaining);
}

function containsFingerprint(plan, fingerprintValue) {
    for (let index = 0; index < plan.length; index += 1) {
        if (intentFingerprint(plan[index]) === fingerprintValue) {
            return true;
        }
    }
    return false;
}

/**
 * Fingerprint of an intent: semantic key + resolved absolute due time.
 * The system reminder is identified by key, but after a timezone or clock
 * change the same local key maps to a different absolute instant, so a diff
 * must treat key+dueAt as the identity of a scheduled reminder.
 */
export function intentFingerprint(intent) {
    const dueAt = intent && intent.dueAt && intent.dueAt.tag === 'Instant'
        ? intent.dueAt.epochMilliseconds
        : 0;
    return (intent.key.value || '') + '@' + dueAt;
}

/**
 * Resolve each intent's local wall minute to an absolute Instant using an
 * explicit UTC offset. Pure: offset is a fact, never read from the platform.
 */
export function attachDueAt(plan, utcOffsetMinutes) {
    const out = [];
    for (let index = 0; index < plan.length; index += 1) {
        const intent = plan[index];
        const resolved = localToInstant(intent.localDate, intent.at, utcOffsetMinutes);
        if (resolved.tag === 'Err') {
            return resolved;
        }
        out.push(Object.freeze(Object.assign({}, intent, { dueAt: resolved.value })));
    }
    return ok(Object.freeze(out));
}

export function diffPlans(desiredPlan, registeredPlan) {
    const desired = combinePlans([], desiredPlan);
    const registered = combinePlans([], registeredPlan);
    const toRegister = desired.filter(function (intent) {
        return !containsFingerprint(registered, intentFingerprint(intent));
    });
    const toCancel = registered.filter(function (intent) {
        return !containsFingerprint(desired, intentFingerprint(intent));
    }).map(function (intent) {
        return intent.key.value;
    });
    const unchanged = desired.filter(function (intent) {
        return containsFingerprint(registered, intentFingerprint(intent));
    }).map(function (intent) {
        return intent.key.value;
    });

    return Object.freeze({
        toRegister: freezePlan(toRegister),
        toCancel: Object.freeze(toCancel),
        unchanged: Object.freeze(unchanged)
    });
}

