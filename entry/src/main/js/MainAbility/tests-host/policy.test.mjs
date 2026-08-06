import assert from 'node:assert/strict';
import test from 'node:test';

import { applyStrategyWindow, buildRecurrenceRules, buildRuleExceptions, findRuleOccurrence } from '../domain/policy.js';
import { initialDomainState } from '../domain/model.js';
import { defaultScheduleSettings, scheduleSettings } from '../domain/settings.js';
import { localDate, minuteOfDay, instant, weekday } from '../domain/values.js';
import { localToInstant } from '../domain/calendar.js';

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

test('policy: buildRecurrenceRules derives the full template from the complete configuration', () => {
    // Mon 2026-08-03 and Tue 2026-08-04 share the 09:25 slot; Mon also has
    // 09:50. The template is a pure function of the CONFIGURATION (P1-02),
    // never of a horizon-limited or suppressed plan sample.
    const settings = scheduleSettings({
        enabledFlag: true,
        weekdays: [weekday('Mon').value, weekday('Tue').value],
        workBlocks: [Object.freeze({
            tag: 'WorkBlock',
            start: minute(540),
            end: minute(720)
        })],
        rhythm: Object.freeze({
            tag: 'Rhythm',
            focusMinutes: Object.freeze({ tag: 'PositiveMinutes', value: 25 }),
            breakMinutes: Object.freeze({ tag: 'PositiveMinutes', value: 5 })
        }),
        version: Object.freeze({ tag: 'SchemaVersion', value: 1 })
    }).value;
    const rules = buildRecurrenceRules(settings);
    assert.equal(rules.length, 6); // 09:25..11:55 every 30 minutes
    const first = rules[0];
    assert.equal(first.tag, 'RecurrenceRule');
    assert.equal(first.repeatKind, 'Weekly');
    assert.equal(first.minuteOfDay, 565);
    assert.deepEqual(first.weekdays, ['Mon', 'Tue']);
    // Stable identity: rhythm + minute + sorted weekday set.
    assert.equal(first.ruleKey, 'recurrence:25-5:565:Mon+Tue');
    // The occurrence key grammar the adapter must fire callbacks with.
    assert.equal(first.semanticKeyPrefix, 'break-start:25-5:');
    assert.equal(rules[5].minuteOfDay, 715);
});

test('policy: rule weekday union covers every configured weekday', () => {
    // P1-02 property: the template must cover the FULL configured weekday set
    // no matter when it is built — a Wednesday enable still yields Mon–Fri.
    const settings = defaultScheduleSettings();
    const rules = buildRecurrenceRules(settings);
    assert.equal(rules.length, 15);
    const union = {};
    for (let index = 0; index < rules.length; index += 1) {
        for (let day = 0; day < rules[index].weekdays.length; day += 1) {
            union[rules[index].weekdays[day]] = true;
        }
    }
    assert.deepEqual(Object.keys(union).sort(), ['Fri', 'Mon', 'Thu', 'Tue', 'Wed']);
});

test('policy: exceptions express skip/pause and never enter the rule template', () => {
    // Scenario I (P1-02): a one-off SkipNext or PauseToday must NOT remove
    // the slot from the weekly rules — the occurrence is suppressed as an
    // exception instead.
    const settings = defaultScheduleSettings();
    const templateBefore = buildRecurrenceRules(settings);

    // Skip the 2026-08-10 (Mon) 09:25 occurrence.
    const skipState = Object.assign({}, initialDomainState(), {
        settings: settings,
        skip: Object.freeze({
            tag: 'SkipReminder',
            reminderKey: Object.freeze({
                tag: 'SemanticKey',
                value: 'break-start:25-5:2026-08-10:565'
            })
        })
    });
    const skipExceptions = buildRuleExceptions(skipState, {
        localWall: { localDate: date(2026, 8, 6), minuteOfDay: minute(600) }
    });
    assert.equal(skipExceptions.length, 1);
    assert.equal(skipExceptions[0].ruleKey, 'recurrence:25-5:565:Fri+Mon+Thu+Tue+Wed');
    assert.equal(skipExceptions[0].occurrenceDate.year, 2026);
    assert.equal(skipExceptions[0].occurrenceDate.month, 8);
    assert.equal(skipExceptions[0].occurrenceDate.day, 10);
    assert.equal(skipExceptions[0].action, 'skip');

    // Pause through today 18:00 (Wed 2026-08-05 in this setup): every rule
    // occurrence at-or-before the pause point gets an exception, but the
    // template itself is untouched.
    const pauseState = Object.assign({}, initialDomainState(), {
        settings: settings,
        pause: Object.freeze({
            tag: 'PauseThroughLocal',
            localDate: date(2026, 8, 5),
            minuteOfDay: minute(1079)
        })
    });
    const pauseExceptions = buildRuleExceptions(pauseState, {
        localWall: { localDate: date(2026, 8, 5), minuteOfDay: minute(600) }
    });
    // 15 rules x 1 day (Wed only) — the pause window is a single day here.
    assert.equal(pauseExceptions.length, 15);
    assert.equal(pauseExceptions.every(function (entry) {
        return entry.action === 'pause' && entry.occurrenceDate.day === 5;
    }), true);

    const templateAfter = buildRecurrenceRules(settings);
    assert.deepEqual(templateAfter, templateBefore,
        'skip/pause must never mutate the rule template');
});

test('policy: buildRecurrenceRules is empty without a rhythm', () => {
    assert.deepEqual(buildRecurrenceRules(null), []);
    assert.deepEqual(buildRecurrenceRules({ weekdays: [], workBlocks: [] }), []);
});

test('policy: findRuleOccurrence validates rule callbacks against template + suppression', () => {
    // P1-01 callback mapping: a rule occurrence's concrete key must resolve
    // through the template (rhythm + weekday + minute) and current
    // suppression, within the reconcile window.
    const settings = defaultScheduleSettings();
    const base = Object.assign({}, initialDomainState(), { settings: settings });
    const resolve = function (dateValue, minuteValue) {
        return localToInstant(dateValue, minuteValue, 480);
    };
    const windowStart = date(2026, 8, 6); // Thursday

    // In-window, template-matching occurrence is valid.
    const valid = findRuleOccurrence(
        base,
        'break-start:25-5:2026-08-06:625',
        resolve,
        windowStart,
        3
    );
    assert.equal(!!valid, true);
    assert.equal(valid.dueAt.tag, 'Instant');
    assert.equal(valid.at.value, 625);

    // Wrong minute (not a slot), wrong weekday (Saturday), wrong rhythm,
    // and out-of-window dates are all stale.
    assert.equal(findRuleOccurrence(base, 'break-start:25-5:2026-08-06:600', resolve, windowStart, 3), undefined);
    assert.equal(findRuleOccurrence(base, 'break-start:25-5:2026-08-08:625', resolve, windowStart, 3), undefined);
    assert.equal(findRuleOccurrence(base, 'break-start:30-5:2026-08-06:625', resolve, windowStart, 3), undefined);
    assert.equal(findRuleOccurrence(base, 'break-start:25-5:2026-08-13:625', resolve, windowStart, 3), undefined);
    assert.equal(findRuleOccurrence(base, 'break-start:25-5:2026-08-05:625', resolve, windowStart, 3), undefined);
    assert.equal(findRuleOccurrence(base, 'not-a-break-key', resolve, windowStart, 3), undefined);

    // A skipped or paused occurrence is invalid.
    const skipped = Object.assign({}, base, {
        skip: Object.freeze({
            tag: 'SkipReminder',
            reminderKey: Object.freeze({
                tag: 'SemanticKey',
                value: 'break-start:25-5:2026-08-06:625'
            })
        })
    });
    assert.equal(findRuleOccurrence(
        skipped, 'break-start:25-5:2026-08-06:625', resolve, windowStart, 3
    ), undefined);

    const paused = Object.assign({}, base, {
        pause: Object.freeze({
            tag: 'PauseThroughLocal',
            localDate: date(2026, 8, 6),
            minuteOfDay: minute(629)
        })
    });
    assert.equal(findRuleOccurrence(
        paused, 'break-start:25-5:2026-08-06:625', resolve, windowStart, 3
    ), undefined);
});
