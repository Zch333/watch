import { addDays, compareLocalDates, instantToLocal, localToInstant, weekdayOf } from '../../domain/calendar.js';
import { err, ok } from '../../domain/result.js';
import { localDate, minuteOfDay, semanticKey } from '../../domain/values.js';
import { REMINDER_ERROR_CODES, reminderError } from '../../ports/reminder-port.js';

/**
 * Recording ReminderSchedulerPort adapter for host tests (v2 contract).
 *
 * One-shot mode: idempotent registration by semantic key (re-register never
 * duplicates), injected failKeys produce per-key partial failure reports.
 *
 * Rule mode (recurrenceRules non-empty): ONE system registration per rule,
 * keyed by the rule's stable ruleKey — never one registration per concrete
 * intent. listRegistered() materializes the OCCURRENCE VIEW: concrete
 * intents for the next expandDays days, resolved per-day through the
 * injected calendar, strictly future, with ruleExceptions silenced — exactly
 * the view the domain's concrete diff reconciles against (P1-01).
 * Injected failRuleKeys (or failKeys matching a rule's expanded occurrence
 * keys) produce rule-level partial failure reports.
 *
 * The calendar is the same port object the domain uses (composition root),
 * so the occurrence view and the domain's desired plan resolve identically,
 * including DST boundaries; standalone contract tests default to a fixed
 * UTC+8 algebra.
 */
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

function isExceptioned(exceptions, ruleKey, date) {
    for (let index = 0; index < exceptions.length; index += 1) {
        const entry = exceptions[index];
        if (entry && entry.ruleKey === ruleKey &&
            compareLocalDates(entry.occurrenceDate, date) === 0) {
            return true;
        }
    }
    return false;
}

export function createRecordingReminder(options) {
    const opts = options || {};
    const capability = opts.capability || Object.freeze({ tag: 'Unknown' });
    const failKeys = (opts.failKeys || []).slice();
    const failRuleKeys = (opts.failRuleKeys || []).slice();
    const registry = new Map();
    let counter = 0;
    let lastRecurrenceRules = [];
    let currentRuleExceptions = [];
    let currentNow = undefined;
    let currentExpandDays = 3;
    let failCancel = !!opts.failCancel;
    const calendar = opts.calendar || {
        utcOffset: function () {
            return ok(480);
        },
        resolve: function (date, minuteValue) {
            return localToInstant(date, minuteValue, 480);
        },
        localWall: function (instantValue, utcOffsetMinutes) {
            return instantToLocal(instantValue, utcOffsetMinutes);
        }
    };

    /**
     * Today's local date through the injected calendar, per the
     * CalendarPort contract (utcOffset + localWall(instant, offset)).
     */
    function currentLocalDate() {
        const offsetResult = calendar.utcOffset(currentNow);
        if (offsetResult.tag === 'Err') {
            return undefined;
        }
        const wallResult = calendar.localWall(currentNow, offsetResult.value);
        if (wallResult.tag === 'Err') {
            return undefined;
        }
        return wallResult.value.localDate;
    }

    function isRuleMode() {
        return lastRecurrenceRules.length > 0;
    }

    /**
     * Materialize the occurrence view of a rule: concrete intents for the
     * next expandDays days (starting at the local date of `now`), future
     * only, per-day resolved, exceptions silenced. Same window and grammar
     * as the domain's desired plan, so diffPlans converges.
     */
    function expandRule(rule) {
        const out = [];
        if (!currentNow || typeof currentNow.epochMilliseconds !== 'number') {
            return out;
        }
        const start = currentLocalDate();
        if (!start) {
            return out;
        }
        let date = start;
        for (let dayIndex = 0; dayIndex < currentExpandDays; dayIndex += 1) {
            const dayResult = weekdayOf(date);
            if (dayResult.tag === 'Ok' &&
                rule.weekdays.indexOf(dayResult.value.value) >= 0 &&
                !isExceptioned(currentRuleExceptions, rule.ruleKey, date)) {
                const minuteResult = minuteOfDay(rule.minuteOfDay);
                if (minuteResult.tag === 'Ok') {
                    const resolved = calendar.resolve(date, minuteResult.value);
                    if (resolved.tag === 'Ok' &&
                        resolved.value.epochMilliseconds > currentNow.epochMilliseconds) {
                        const keyResult = semanticKey(
                            rule.semanticKeyPrefix + dateText(date) + ':' + rule.minuteOfDay
                        );
                        if (keyResult.tag === 'Ok') {
                            out.push(Object.freeze({
                                tag: 'BreakStart',
                                key: keyResult.value,
                                localDate: date,
                                at: minuteResult.value,
                                dueAt: resolved.value
                            }));
                        }
                    }
                }
            }
            const next = addDays(date, 1);
            if (next.tag === 'Err') {
                break;
            }
            date = next.value;
        }
        return out;
    }

    function expandAllRules(rules) {
        const out = [];
        for (let index = 0; index < rules.length; index += 1) {
            const expanded = expandRule(rules[index]);
            for (let inner = 0; inner < expanded.length; inner += 1) {
                out.push(expanded[inner]);
            }
        }
        out.sort(function (left, right) {
            if (left.key.value < right.key.value) {
                return -1;
            }
            if (left.key.value > right.key.value) {
                return 1;
            }
            return 0;
        });
        return out;
    }

    /**
     * Rule-level failure injection: a rule fails when its ruleKey is in
     * failRuleKeys, or when any of its expanded occurrence keys is in
     * failKeys (maps concrete-key failures onto the registering rule).
     */
    function ruleFails(rule) {
        if (failRuleKeys.indexOf(rule.ruleKey) >= 0) {
            return true;
        }
        if (failKeys.length === 0) {
            return false;
        }
        const expanded = expandRule(rule);
        for (let index = 0; index < expanded.length; index += 1) {
            if (failKeys.indexOf(expanded[index].key.value) >= 0) {
                return true;
            }
        }
        return false;
    }

    return {
        probeCapabilities() {
            if (capability.tag === 'Unsupported') {
                return err(reminderError(REMINDER_ERROR_CODES.UNSUPPORTED, null));
            }
            if (capability.tag === 'RequiresApproval') {
                return err(reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null));
            }
            return ok(capability);
        },
        listRegistered() {
            const list = [];
            registry.forEach(function (entry) {
                if (entry.rule) {
                    const expanded = expandRule(entry.rule);
                    for (let index = 0; index < expanded.length; index += 1) {
                        list.push(expanded[index]);
                    }
                } else if (entry.intent) {
                    list.push(entry.intent);
                }
            });
            return ok(Object.freeze(list));
        },
        /**
         * register(request) per ReminderSchedulerPort/v2.
         * request = { intents, recurrenceRules, ruleExceptions, now, expandDays }.
         * A bare array is accepted for legacy callers and treated as
         * { intents, recurrenceRules: [] }.
         */
        register(request) {
            const input = Array.isArray(request)
                ? { intents: request, recurrenceRules: [], ruleExceptions: [] }
                : request;
            const intents = input && Array.isArray(input.intents)
                ? input.intents
                : [];
            const recurrenceRules =
                input && Array.isArray(input.recurrenceRules)
                    ? input.recurrenceRules
                    : [];
            const ruleExceptions =
                input && Array.isArray(input.ruleExceptions)
                    ? input.ruleExceptions
                    : [];
            if (input && typeof input.expandDays === 'number') {
                currentExpandDays = input.expandDays;
            }
            if (input && input.now && input.now.tag === 'Instant') {
                currentNow = input.now;
            }
            // Record the rules/exceptions so contract tests can assert them.
            lastRecurrenceRules = recurrenceRules.slice();
            currentRuleExceptions = ruleExceptions.slice();

            const registered = [];
            const failed = [];
            if (recurrenceRules.length > 0) {
                // Rule mode: ONE system registration per ruleKey, and the
                // rule set is REPLACED WHOLESALE: every rule not in the new
                // set is removed, leftovers from a previous configuration
                // never survive (a re-configure must not leak stale weekly
                // rules that keep firing, review HIGH-P1-01).
                const staleKeys = [];
                registry.forEach(function (entry, identity) {
                    if (!entry.rule) {
                        staleKeys.push(identity);
                    }
                });
                const desiredKeys = {};
                for (let index = 0; index < recurrenceRules.length; index += 1) {
                    const rule = recurrenceRules[index];
                    if (rule && typeof rule.ruleKey === 'string') {
                        desiredKeys[rule.ruleKey] = true;
                    }
                }
                registry.forEach(function (entry, identity) {
                    if (entry.rule && !desiredKeys[identity]) {
                        staleKeys.push(identity);
                    }
                });
                for (let index = 0; index < staleKeys.length; index += 1) {
                    registry.delete(staleKeys[index]);
                }
                for (let index = 0; index < recurrenceRules.length; index += 1) {
                    const rule = recurrenceRules[index];
                    if (!rule || typeof rule.ruleKey !== 'string') {
                        failed.push(Object.freeze({
                            ruleKey: rule && rule.ruleKey,
                            error: reminderError(REMINDER_ERROR_CODES.INVALID_INTENT, { rule: rule })
                        }));
                        continue;
                    }
                    if (ruleFails(rule)) {
                        failed.push(Object.freeze({
                            ruleKey: rule.ruleKey,
                            error: reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, {
                                ruleKey: rule.ruleKey
                            })
                        }));
                        continue;
                    }
                    if (registry.has(rule.ruleKey)) {
                        // Idempotent by ruleKey: keep the system id stable.
                        registry.set(rule.ruleKey, {
                            systemId: registry.get(rule.ruleKey).systemId,
                            rule: rule
                        });
                        registered.push(Object.freeze({
                            ruleKey: rule.ruleKey,
                            systemId: registry.get(rule.ruleKey).systemId
                        }));
                        continue;
                    }
                    counter += 1;
                    const systemId = 'sys-' + counter;
                    registry.set(rule.ruleKey, { systemId: systemId, rule: rule });
                    registered.push(Object.freeze({ ruleKey: rule.ruleKey, systemId: systemId }));
                }
            } else {
                // One-shot mode: registering concrete intents supersedes any
                // previously registered rules.
                const staleRuleKeys = [];
                registry.forEach(function (entry, identity) {
                    if (entry.rule) {
                        staleRuleKeys.push(identity);
                    }
                });
                for (let index = 0; index < staleRuleKeys.length; index += 1) {
                    registry.delete(staleRuleKeys[index]);
                }
                for (let index = 0; index < intents.length; index += 1) {
                    const intent = intents[index];
                    const key = intent.key.value;
                    if (failKeys.indexOf(key) >= 0) {
                        failed.push(Object.freeze({
                            key: key,
                            error: reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, { key: key })
                        }));
                        continue;
                    }
                    if (registry.has(key)) {
                        // Idempotent by key, but reschedule: store the fresh
                        // intent (with its absolute dueAt) while keeping the
                        // system id stable.
                        registry.set(key, { systemId: registry.get(key).systemId, intent: intent });
                        registered.push(Object.freeze({
                            key: key,
                            systemId: registry.get(key).systemId
                        }));
                        continue;
                    }
                    counter += 1;
                    const systemId = 'sys-' + counter;
                    registry.set(key, { systemId: systemId, intent: intent });
                    registered.push(Object.freeze({ key: key, systemId: systemId }));
                }
            }
            const report = Object.freeze({
                registered: Object.freeze(registered),
                failed: Object.freeze(failed)
            });
            if (failed.length > 0) {
                return err(reminderError(REMINDER_ERROR_CODES.PARTIAL_FAILURE, report));
            }
            return ok(report);
        },
        cancel(keys) {
            if (failCancel) {
                return err(reminderError(REMINDER_ERROR_CODES.PERMISSION_DENIED, null));
            }
            const cancelled = [];
            const missing = [];
            for (let index = 0; index < keys.length; index += 1) {
                const key = keys[index];
                if (registry.has(key)) {
                    registry.delete(key);
                    cancelled.push(key);
                } else {
                    missing.push(key);
                }
            }
            return ok(Object.freeze({
                cancelled: Object.freeze(cancelled),
                missing: Object.freeze(missing)
            }));
        },
        _clearFailKeys() {
            failKeys.length = 0;
            failRuleKeys.length = 0;
        },
        _setFailCancel(value) {
            failCancel = !!value;
        },
        _lastRecurrenceRules() {
            return lastRecurrenceRules.slice();
        },
        _lastRuleExceptions() {
            return currentRuleExceptions.slice();
        },
        _mappings() {
            const list = [];
            registry.forEach(function (entry, identity) {
                if (entry.rule) {
                    list.push({ ruleKey: identity, systemId: entry.systemId });
                } else {
                    list.push({ key: identity, systemId: entry.systemId });
                }
            });
            return list;
        },
        _ruleMappings() {
            const list = [];
            registry.forEach(function (entry, identity) {
                if (entry.rule) {
                    list.push({ ruleKey: identity, systemId: entry.systemId });
                }
            });
            return list;
        }
    };
}
