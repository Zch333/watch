import { addDays, compareLocalDates, weekdayOf } from './calendar.js';
import { domainError, ERROR_CODES } from './errors.js';
import { noPause, noSkip, parseBreakStartKey } from './plan.js';
import { err, ok } from './result.js';
import { minuteOfDay, semanticKey } from './values.js';

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
 * Build the weekly recurrence rule template from the COMPLETE schedule
 * configuration — not from an instantiated, horizon-limited or suppressed
 * plan. This is the P1-02 fix: the template must cover every configured
 * weekday no matter when it is built (a Wednesday enable still yields
 * Mon–Fri rules), and one-off suppressions (skip/pause/future filtering)
 * are expressed as occurrence-level ruleExceptions, never folded into the
 * template itself.
 *
 * One rule per reminder minute-of-day slot, carrying:
 *   - ruleKey: stable identity `recurrence:<rhythm>:<minute>:<weekdays+>`,
 *     so "one rule = one system registration" is addressable and idempotent
 *     (re-registering the same configuration keeps the system registration);
 *   - semanticKeyPrefix: the concrete occurrence key grammar the adapter
 *     uses to build callback keys (`break-start:<rhythm>:` + date + minute);
 *   - weekdays / minuteOfDay / repeatKind: what the platform schedules.
 * Pure; requires valid ScheduleSettings (settings.js smart constructor).
 */
export function buildRecurrenceRules(settings) {
    const byMinute = {};
    const order = [];
    const weekdays = (settings && settings.weekdays) || [];
    const blocks = (settings && settings.workBlocks) || [];
    const rhythm = settings && settings.rhythm;

    if (!rhythm || rhythm.focusMinutes === undefined || rhythm.breakMinutes === undefined) {
        return Object.freeze([]);
    }
    const focusMinutes = rhythm.focusMinutes.value;
    const breakMinutes = rhythm.breakMinutes.value;
    const cycleMinutes = focusMinutes + breakMinutes;

    for (let dayIndex = 0; dayIndex < weekdays.length; dayIndex += 1) {
        const dayName = weekdays[dayIndex].value;
        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
            const block = blocks[blockIndex];
            // Same slot formula as generateBlockPlan (plan.js): a break-start
            // point exists when the full focus segment fits before the block
            // ends. The template must agree with the concrete plan exactly.
            let cycleStart = block.start.value;
            while (cycleStart + focusMinutes <= block.end.value) {
                const minute = cycleStart + focusMinutes;
                if (!byMinute[minute]) {
                    byMinute[minute] = { weekdays: {} };
                    order.push(minute);
                }
                byMinute[minute].weekdays[dayName] = true;
                cycleStart += cycleMinutes;
            }
        }
    }

    const rhythmVersion = focusMinutes + '-' + breakMinutes;
    const rules = order.map(function (minute) {
        const dayNames = Object.keys(byMinute[minute].weekdays).sort();
        return Object.freeze({
            tag: 'RecurrenceRule',
            ruleKey: 'recurrence:' + rhythmVersion + ':' + minute + ':' + dayNames.join('+'),
            semanticKeyPrefix: 'break-start:' + rhythmVersion + ':',
            weekdays: Object.freeze(dayNames),
            minuteOfDay: minute,
            repeatKind: 'Weekly'
        });
    });
    return Object.freeze(rules);
}

function exception(ruleKey, occurrenceDate, action) {
    return Object.freeze({
        tag: 'RuleException',
        ruleKey: ruleKey,
        occurrenceDate: occurrenceDate,
        action: action
    });
}

/**
 * Occurrence-level suppression expressed against the rule template (P1-01).
 *
 * A skip suppresses exactly one occurrence: the rule slot whose minute and
 * weekday match the skipped semantic key, on the key's own date. A pause
 * suppresses every rule occurrence at-or-before the pause point (same
 * half-open semantics as applySuppression in plan.js). Exceptions are
 * naturally bounded: the pause carries its end date, a skip carries one date.
 *
 * The adapter silences exactly these (rule, date) pairs when it expands or
 * fires weekly rules; the rule template itself is never touched.
 */
export function buildRuleExceptions(state, facts) {
    const exceptions = [];
    const rules = buildRecurrenceRules(state.settings);
    if (rules.length === 0) {
        return Object.freeze(exceptions);
    }

    const skip = state.skip || noSkip();
    if (skip.tag === 'SkipReminder' && skip.reminderKey &&
        typeof skip.reminderKey.value === 'string') {
        const parsed = parseBreakStartKey(skip.reminderKey.value);
        if (parsed) {
            const dayResult = weekdayOf(parsed.localDate);
            if (dayResult.tag === 'Ok') {
                for (let index = 0; index < rules.length; index += 1) {
                    if (rules[index].minuteOfDay === parsed.minuteOfDay &&
                        rules[index].weekdays.indexOf(dayResult.value.value) >= 0 &&
                        rules[index].semanticKeyPrefix === 'break-start:' + parsed.rhythmVersion + ':') {
                        exceptions.push(exception(rules[index].ruleKey, parsed.localDate, 'skip'));
                        break;
                    }
                }
            }
        }
    }

    const pause = state.pause || noPause();
    if (pause.tag === 'PauseThroughLocal' && facts && facts.localWall &&
        facts.localWall.localDate) {
        const start = facts.localWall.localDate;
        const end = pause.localDate;
        for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
            const rule = rules[ruleIndex];
            let date = start;
            while (compareLocalDates(date, end) <= 0) {
                const dayResult = weekdayOf(date);
                if (dayResult.tag === 'Ok' && rule.weekdays.indexOf(dayResult.value.value) >= 0) {
                    const atOrBeforePause = compareLocalDates(date, end) < 0 ||
                        (compareLocalDates(date, end) === 0 &&
                            rule.minuteOfDay <= pause.minuteOfDay.value);
                    if (atOrBeforePause) {
                        exceptions.push(exception(rule.ruleKey, date, 'pause'));
                    }
                }
                const next = addDays(date, 1);
                if (next.tag === 'Err') {
                    break;
                }
                date = next.value;
            }
        }
    }

    return Object.freeze(exceptions);
}

/**
 * Validate a reminder callback that arrived for a weekly-rule occurrence.
 *
 * The concrete plan lookup (buildSuppressedPlan) covers the reconcile
 * horizon; the rule template validates the SAME window (documented rule:
 * callback validity is decided by whether the suppressed plan contains the
 * key, not by arrival time). This function bridges any plan/template
 * divergence inside that window — e.g. a reconcile that failed to replace an
 * old rule, or a callback whose key the current plan no longer generates —
 * and rejects everything else (wrong weekday/minute/rhythm, suppressed
 * occurrences, out-of-window dates).
 *
 * The occurrence's absolute due time is resolved per-day through the
 * calendar resolver (DST: local calendar time, resolved per date), which is
 * exactly the mapping the ReminderSchedulerPort/v2 contract defines for
 * rule callbacks. Returns an intent-like value or undefined.
 */
export function findRuleOccurrence(state, keyValue, resolveLocal, windowStartDate, horizonDays) {
    const parsed = parseBreakStartKey(keyValue);
    if (!parsed) {
        return undefined;
    }
    // Same window as buildSuppressedPlan: [windowStart, windowStart + horizon).
    if (windowStartDate) {
        const horizon = typeof horizonDays === 'number' ? horizonDays : 3;
        if (compareLocalDates(parsed.localDate, windowStartDate) < 0) {
            return undefined;
        }
        const end = addDays(windowStartDate, horizon);
        if (end.tag === 'Err' || compareLocalDates(parsed.localDate, end.value) >= 0) {
            return undefined;
        }
    }
    const dayResult = weekdayOf(parsed.localDate);
    if (dayResult.tag === 'Err') {
        return undefined;
    }
    const rules = buildRecurrenceRules(state.settings);
    let rule;
    for (let index = 0; index < rules.length; index += 1) {
        if (rules[index].minuteOfDay === parsed.minuteOfDay &&
            rules[index].weekdays.indexOf(dayResult.value.value) >= 0 &&
            rules[index].semanticKeyPrefix === 'break-start:' + parsed.rhythmVersion + ':') {
            rule = rules[index];
            break;
        }
    }
    if (!rule) {
        return undefined;
    }
    const skip = state.skip || noSkip();
    if (skip.tag === 'SkipReminder' && skip.reminderKey &&
        skip.reminderKey.value === keyValue) {
        return undefined;
    }
    const pause = state.pause || noPause();
    if (pause.tag === 'PauseThroughLocal') {
        const dateOrder = compareLocalDates(parsed.localDate, pause.localDate);
        if (dateOrder < 0 || (dateOrder === 0 && parsed.minuteOfDay <= pause.minuteOfDay.value)) {
            return undefined;
        }
    }
    if (typeof resolveLocal !== 'function') {
        return undefined;
    }
    const minuteResult = minuteOfDay(parsed.minuteOfDay);
    if (minuteResult.tag === 'Err') {
        return undefined;
    }
    const resolved = resolveLocal(parsed.localDate, minuteResult.value);
    if (resolved.tag === 'Err') {
        return undefined;
    }
    const keyResult = semanticKey(keyValue);
    if (keyResult.tag === 'Err') {
        return undefined;
    }
    return Object.freeze({
        tag: 'BreakStart',
        key: keyResult.value,
        localDate: parsed.localDate,
        at: minuteResult.value,
        dueAt: resolved.value
    });
}
