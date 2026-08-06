import { weekdayOf } from './calendar.js';
import { domainError, ERROR_CODES } from './errors.js';
import { err, ok } from './result.js';

/**
 * Reliable background enablement is only allowed for Supported capability.
 * Unknown/Unsupported/RequiresApproval/Degraded must not present as fully enabled.
 */
export function canEnableReliable(capability) {
    return capability && capability.tag === 'Supported';
}

export function assertCanEnableReliable(capability) {
    if (canEnableReliable(capability)) {
        return ok(capability);
    }
    return err(domainError(ERROR_CODES.CAPABILITY_NOT_CONFIRMED, capability));
}

/**
 * Choose registration strategy from observed capability features.
 * Conservative defaults: unknown features are treated as false.
 */
export function chooseSchedulingStrategy(capability, desiredPlan) {
    if (!capability || capability.tag === 'Unknown') {
        return err(domainError(ERROR_CODES.CAPABILITY_NOT_CONFIRMED, capability));
    }
    if (capability.tag === 'Unsupported' || capability.tag === 'RequiresApproval') {
        return err(domainError(ERROR_CODES.CAPABILITY_NOT_CONFIRMED, capability));
    }
    if (capability.tag === 'Degraded') {
        return ok(Object.freeze({
            tag: 'RollingWindowStrategy',
            days: 1,
            reason: capability.reason,
            planSize: desiredPlan ? desiredPlan.length : 0
        }));
    }

    const features = capability.features || {};
    const maxPending = typeof features.maxPendingCount === 'number' ? features.maxPendingCount : 1;
    if (features.supportsRecurring === true && features.supportsCalendar === true) {
        return ok(Object.freeze({
            tag: 'RecurringCalendarStrategy',
            maxPendingCount: maxPending,
            planSize: desiredPlan ? desiredPlan.length : 0
        }));
    }
    if (maxPending >= 1) {
        const days = maxPending >= 15 ? 3 : 1;
        return ok(Object.freeze({
            tag: 'RollingWindowStrategy',
            days: days,
            maxPendingCount: maxPending,
            planSize: desiredPlan ? desiredPlan.length : 0
        }));
    }
    return ok(Object.freeze({
        tag: 'SingleNextStrategy',
        planSize: desiredPlan ? desiredPlan.length : 0
    }));
}

/**
 * Bound desired plan to strategy capacity. Each strategy is interpreted, not
 * just sliced:
 *
 *  - SingleNextStrategy: register exactly the nearest future intent, chosen by
 *    absolute dueAt regardless of input order.
 *  - RollingWindowStrategy: keep only intents whose absolute dueAt falls inside
 *    the next `days` days (from `now`), capped at the platform capacity.
 *  - RecurringCalendarStrategy: the full horizon plan passes through; the
 *    adapter repeats it weekly via recurrence rules, so concrete-date
 *    truncation here would silently drop weekdays (e.g. slice(0, 2) keeps
 *    only Mon–Wed of a Mon–Fri plan). Rule-count capacity is checked by the
 *    caller AFTER buildRecurrenceRules folds the plan.
 *
 * `now` is the explicit current instant fact; the domain never reads the clock.
 */
function epochMilliseconds(value) {
    return value && value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number' && isFinite(value.epochMilliseconds)
        ? value.epochMilliseconds
        : null;
}

/**
 * An intent is "past" when its absolute due time is strictly before now.
 * The late-delivery cancel guard lives in diffPlans (plan.js), where the
 * registered reminder itself is visible; the desired plan here only ever
 * contains strictly future intents.
 */
function isPast(dueMs, nowMs) {
    if (dueMs === null || nowMs === null) {
        return false;
    }
    return dueMs < nowMs;
}

function nearestFutureIntent(plan, nowMs) {
    let nearest = undefined;
    for (let index = 0; index < plan.length; index += 1) {
        const dueMs = epochMilliseconds(plan[index].dueAt);
        if (dueMs === null) {
            continue;
        }
        if (isPast(dueMs, nowMs)) {
            continue;
        }
        if (nearest === undefined || dueMs < epochMilliseconds(nearest.dueAt)) {
            nearest = plan[index];
        }
    }
    return nearest;
}

export function applyStrategyWindow(desiredPlan, strategy, now) {
    const plan = desiredPlan || [];
    if (!strategy) {
        return Object.freeze(plan.slice());
    }
    const nowMs = epochMilliseconds(now);

    if (strategy.tag === 'SingleNextStrategy') {
        const nearest = nearestFutureIntent(plan, nowMs);
        return nearest === undefined ? Object.freeze([]) : Object.freeze([nearest]);
    }

    if (strategy.tag === 'RollingWindowStrategy') {
        const days = typeof strategy.days === 'number' ? strategy.days : 1;
        const capacity = typeof strategy.maxPendingCount === 'number' ? strategy.maxPendingCount : 30;
        const horizonMs = nowMs === null ? null : nowMs + days * 24 * 60 * 60 * 1000;
        const windowed = plan.filter(function (intent) {
            const dueMs = epochMilliseconds(intent.dueAt);
            if (dueMs === null) {
                return false;
            }
            if (isPast(dueMs, nowMs)) {
                return false;
            }
            if (horizonMs !== null && dueMs > horizonMs) {
                return false;
            }
            return true;
        });
        return Object.freeze(windowed.slice(0, capacity));
    }

    // RecurringCalendarStrategy and any future strategy: pass the plan through
    // UNTRUNCATED. Concrete-date truncation before rule folding would drop
    // whole weekdays; the rule-count capacity check happens in the caller
    // after buildRecurrenceRules (see reconcileEffects in decide.js).
    return Object.freeze(plan.slice());
}

/**
 * Collapse a concrete-date plan into weekly recurrence rules: one rule per
 * reminder minute-of-day, carrying the weekday set. This is the artifact a
 * RecurringCalendar adapter consumes (register once, repeat weekly) instead
 * of one registration per concrete date. Pure; requires dueAt-free intents
 * with a valid localDate.
 */
export function buildRecurrenceRules(plan) {
    const byMinute = {};
    const order = [];

    for (let index = 0; index < (plan || []).length; index += 1) {
        const intent = plan[index];
        if (!intent || !intent.localDate || !intent.at) {
            continue;
        }
        const dayResult = weekdayOf(intent.localDate);
        if (dayResult.tag === 'Err') {
            continue;
        }
        const minute = intent.at.value;
        if (!byMinute[minute]) {
            byMinute[minute] = { weekdays: {} };
            order.push(minute);
        }
        byMinute[minute].weekdays[dayResult.value.value] = true;
    }

    const rules = order.map(function (minute) {
        return Object.freeze({
            tag: 'RecurrenceRule',
            weekdays: Object.freeze(Object.keys(byMinute[minute].weekdays).sort()),
            minuteOfDay: minute,
            repeatKind: 'Weekly'
        });
    });
    return Object.freeze(rules);
}
