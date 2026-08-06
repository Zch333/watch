import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applySuppression,
    combinePlans,
    diffPlans,
    generateBlockPlan,
    noPause,
    noSkip,
    pauseThroughLocal,
    skipReminder
} from '../domain/plan.js';
import { rhythm, workBlock } from '../domain/schedule.js';
import { localDate, minuteOfDay, positiveMinutes } from '../domain/values.js';

function valid(result) {
    assert.equal(result.tag, 'Ok');
    return result.value;
}

function fixture(dateParts, startMinute, endMinute, focusMinutes, breakMinutes) {
    return {
        date: valid(localDate(dateParts[0], dateParts[1], dateParts[2])),
        block: valid(workBlock(
            valid(minuteOfDay(startMinute)),
            valid(minuteOfDay(endMinute))
        )),
        rhythm: valid(rhythm(
            valid(positiveMinutes(focusMinutes, 720)),
            valid(positiveMinutes(breakMinutes, 720))
        ))
    };
}

function keys(plan) {
    return plan.map(function (intent) {
        return intent.key.value;
    });
}

test('example: generateBlockPlan emits focus completion points', () => {
    const input = fixture([2026, 8, 6], 540, 660, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);

    assert.deepEqual(plan.map(function (intent) {
        return intent.at.value;
    }), [565, 595, 625, 655]);
    assert.equal(plan[0].tag, 'BreakStart');
    assert.equal(plan[0].key.value, 'break-start:25-5:2026-08-06:565');
});

test('example: generateBlockPlan returns empty when a focus segment cannot finish', () => {
    const input = fixture([2026, 8, 6], 540, 564, 25, 5);
    assert.deepEqual(generateBlockPlan(input.date, input.block, input.rhythm), []);
});

test('example: a block exactly as long as the focus segment emits one intent', () => {
    const input = fixture([2026, 8, 6], 540, 565, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);
    assert.deepEqual(plan.map(function (intent) {
        return intent.at.value;
    }), [565]);
});

test('example: a break may end exactly at the block end', () => {
    // 540 + 25 = 565 (break start), break ends at 570 == block.end.
    const input = fixture([2026, 8, 6], 540, 570, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);
    assert.deepEqual(plan.map(function (intent) {
        return intent.at.value;
    }), [565]);
});

test('example: a block shorter than one cycle but long enough for one focus emits one intent', () => {
    // 540..585: one focus (540-565) + partial break fits; next focus (570) would end at 595 > 585.
    const input = fixture([2026, 8, 6], 540, 585, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);
    assert.deepEqual(plan.map(function (intent) {
        return intent.at.value;
    }), [565]);
});

test('property: generated points are sorted, in range, and one cycle apart', () => {
    for (let start = 0; start <= 1320; start += 37) {
        for (let focus = 1; focus <= 60; focus += 7) {
            const activity = (focus % 11) + 1;
            const end = Math.min(1439, start + 120);
            const input = fixture([2028, 2, 29], start, end, focus, activity);
            const plan = generateBlockPlan(input.date, input.block, input.rhythm);

            for (let index = 0; index < plan.length; index += 1) {
                assert.equal(plan[index].at.value > start, true);
                assert.equal(plan[index].at.value <= end, true);
                if (index > 0) {
                    assert.equal(
                        plan[index].at.value - plan[index - 1].at.value,
                        focus + activity
                    );
                }
            }
        }
    }
});

test('example: combinePlans sorts and deduplicates by semantic key', () => {
    const morning = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 540, 600, 25, 5)));
    const afternoon = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 810, 870, 25, 5)));
    const combined = combinePlans(afternoon, combinePlans(morning, morning));

    assert.deepEqual(combined.map(function (intent) {
        return intent.at.value;
    }), [565, 595, 835, 865]);
});

test('property: combinePlans has identity, idempotence, associativity, and commutativity', () => {
    const a = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 540, 630, 25, 5)));
    const b = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 810, 900, 25, 5)));
    const c = generateBlockPlan(...Object.values(fixture([2026, 8, 7], 540, 630, 20, 10)));

    assert.deepEqual(combinePlans(a, []), a);
    assert.deepEqual(combinePlans([], a), a);
    assert.deepEqual(combinePlans(a, a), a);
    assert.deepEqual(combinePlans(combinePlans(a, b), c), combinePlans(a, combinePlans(b, c)));
    assert.deepEqual(combinePlans(a, b), combinePlans(b, a));
});

test('example: applySuppression removes pause range and at most one skipped key', () => {
    const input = fixture([2026, 8, 6], 540, 690, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);
    const pause = pauseThroughLocal(input.date, valid(minuteOfDay(595)));
    const skip = skipReminder(plan[2].key);
    const suppressed = applySuppression(plan, pause, skip);

    assert.deepEqual(suppressed.map(function (intent) {
        return intent.at.value;
    }), [655, 685]);
    assert.deepEqual(applySuppression(plan, noPause(), noSkip()), plan);
});

test('property: suppression is a monotonic subset and never removes two duplicate-key positions', () => {
    const input = fixture([2026, 8, 6], 540, 900, 25, 5);
    const plan = generateBlockPlan(input.date, input.block, input.rhythm);
    const suppressed = applySuppression(
        plan,
        pauseThroughLocal(input.date, valid(minuteOfDay(625))),
        skipReminder(plan[4].key)
    );

    assert.equal(suppressed.length <= plan.length, true);
    assert.equal(suppressed.every(function (intent) {
        return keys(plan).indexOf(intent.key.value) >= 0;
    }), true);
    assert.equal(plan.length - suppressed.length, 4);
});

test('example: diffPlans partitions desired and registered plans by semantic key', () => {
    const a = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 540, 630, 25, 5)));
    const b = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 810, 900, 25, 5)));
    const diff = diffPlans(combinePlans(a, b), a);

    assert.deepEqual(keys(diff.toRegister), keys(b));
    assert.deepEqual(diff.toCancel, []);
    assert.deepEqual(diff.unchanged, keys(a));
});

test('property: diffPlans is empty for equal plans and converges after application', () => {
    const desired = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 540, 750, 25, 5)));
    const registered = generateBlockPlan(...Object.values(fixture([2026, 8, 6], 540, 660, 25, 5)));

    assert.deepEqual(diffPlans(desired, desired), {
        toRegister: [],
        toCancel: [],
        unchanged: keys(desired)
    });

    const firstDiff = diffPlans(desired, registered);
    const afterCancel = registered.filter(function (intent) {
        return firstDiff.toCancel.indexOf(intent.key.value) < 0;
    });
    const reconciled = combinePlans(afterCancel, firstDiff.toRegister);
    const secondDiff = diffPlans(desired, reconciled);

    assert.deepEqual(secondDiff.toRegister, []);
    assert.deepEqual(secondDiff.toCancel, []);
    assert.deepEqual(secondDiff.unchanged, keys(desired));
});
