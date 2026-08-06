import assert from 'node:assert/strict';
import test from 'node:test';

import { applyStrategyWindow, buildRecurrenceRules } from '../domain/policy.js';
import { localDate, minuteOfDay, instant } from '../domain/values.js';

const OFFSET = 480; // UTC+8, only used for helper instant resolution

function date(y, m, d) {
    const result = localDate(y, m, d);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function minute(value) {
    const result = minuteOfDay(value);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function instantAt(epochMs) {
    const result = instant(epochMs);
    assert.equal(result.tag, 'Ok');
    return result.value;
}

/**
 * A concrete intent: localDate + at are the plan identity, dueAt the resolved
 * absolute instant (post-attachDueAt). The strategy only looks at dueAt.
 */
function intent(dateValue, atMinute, epochMs) {
    return Object.freeze({
        tag: 'BreakStart',
        key: Object.freeze({ tag: 'SemanticKey', value: 'break-start:k:' + atMinute }),
        localDate: dateValue,
        at: minute(atMinute),
        dueAt: instantAt(epochMs)
    });
}

const T0 = 1780000000000; // arbitrary epoch baseline
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('policy: SingleNext registers exactly the nearest future intent by dueAt', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 + 2 * HOUR),
        intent(d, 590, T0 + 30 * 60 * 1000),
        intent(d, 615, T0 + 1 * HOUR)
    ];
    const result = applyStrategyWindow(plan, { tag: 'SingleNextStrategy' }, instantAt(T0));
    assert.equal(result.length, 1);
    assert.equal(result[0].at.value, 590);
});

test('policy: SingleNext drops past intents and returns empty when nothing is left', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 - 1 * HOUR),
        intent(d, 590, T0 - 30 * 60 * 1000)
    ];
    const result = applyStrategyWindow(plan, { tag: 'SingleNextStrategy' }, instantAt(T0));
    assert.equal(result.length, 0);
});

test('policy: RollingWindow keeps only intents within `days` of now', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 + 6 * HOUR),   // inside 1 day
        intent(d, 590, T0 + 30 * HOUR)   // beyond 1 day
    ];
    const result = applyStrategyWindow(
        plan,
        { tag: 'RollingWindowStrategy', days: 1, maxPendingCount: 30 },
        instantAt(T0)
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].at.value, 565);
});

test('policy: RollingWindow applies the capacity bound after the day window', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 + 1 * HOUR),
        intent(d, 590, T0 + 2 * HOUR),
        intent(d, 615, T0 + 3 * HOUR),
        intent(d, 640, T0 + 4 * HOUR)
    ];
    const result = applyStrategyWindow(
        plan,
        { tag: 'RollingWindowStrategy', days: 3, maxPendingCount: 2 },
        instantAt(T0)
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].at.value, 565);
    assert.equal(result[1].at.value, 590);
});

test('policy: RollingWindow excludes past intents even inside the window', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 - 2 * HOUR),
        intent(d, 590, T0 + 2 * HOUR)
    ];
    const result = applyStrategyWindow(
        plan,
        { tag: 'RollingWindowStrategy', days: 1, maxPendingCount: 30 },
        instantAt(T0)
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].at.value, 590);
});

test('policy: RecurringCalendar passes the full plan through untruncated', () => {
    const d = date(2026, 8, 6);
    const plan = [
        intent(d, 565, T0 + 1 * HOUR),
        intent(d, 590, T0 + 2 * HOUR),
        intent(d, 615, T0 + 3 * HOUR)
    ];
    // Concrete-date truncation here would silently drop weekdays from the
    // weekly recurrence rules (review P1-06); capacity is checked on the
    // folded RULE count by the caller (reconcileEffects), not on intents.
    const result = applyStrategyWindow(
        plan,
        { tag: 'RecurringCalendarStrategy', maxPendingCount: 2 },
        instantAt(T0)
    );
    assert.equal(result.length, 3);
    assert.equal(result[0].at.value, 565);
    assert.equal(result[2].at.value, 615);
});

test('policy: buildRecurrenceRules collapses concrete dates into weekly weekday+minute rules', () => {
    // Mon 2026-08-03 and Tue 2026-08-04 share the 09:25 slot; Mon also has 09:50.
    const mon = date(2026, 8, 3);
    const tue = date(2026, 8, 4);
    const plan = [
        intent(mon, 565, T0),
        intent(mon, 590, T0 + 1 * HOUR),
        intent(tue, 565, T0 + DAY)
    ];
    const rules = buildRecurrenceRules(plan);
    assert.equal(rules.length, 2);
    assert.equal(rules[0].tag, 'RecurrenceRule');
    assert.equal(rules[0].repeatKind, 'Weekly');
    assert.equal(rules[0].minuteOfDay, 565);
    assert.deepEqual(rules[0].weekdays, ['Mon', 'Tue']);
    assert.equal(rules[1].minuteOfDay, 590);
    assert.deepEqual(rules[1].weekdays, ['Mon']);
});

test('policy: buildRecurrenceRules is empty for an empty plan', () => {
    assert.deepEqual(buildRecurrenceRules([]), []);
});
