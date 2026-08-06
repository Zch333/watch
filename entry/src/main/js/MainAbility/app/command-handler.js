import { decide } from '../domain/decide.js';
import { domainError, ERROR_CODES } from '../domain/errors.js';
import { evolveAll, reduceTemporalState } from '../domain/evolve.js';
import { err, ok } from '../domain/result.js';
import { settlePlanLifecycle } from '../domain/settle.js';
import { createSnapshot } from '../domain/snapshot.js';
import { interpretEffect } from './effect-interpreter.js';

const NAMESPACE = 'move25';
const DEFAULT_HORIZON_DAYS = 3;

function isValidInstant(value) {
    return value !== null && typeof value === 'object' &&
        value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number' &&
        isFinite(value.epochMilliseconds);
}

/**
 * Only commands that reconcile against the currently registered reminders
 * need the registered-plan fact. Commands like starting/completing a break
 * must not fail because the reminder registry is temporarily unavailable.
 */
function commandNeedsRegisteredPlan(command) {
    switch (command && command.tag) {
        case 'EnablePlan':
        case 'DisablePlan':
        case 'ConfigureSchedule':
        case 'PauseUntil':
        case 'PauseForToday':
        case 'PauseForOneHour':
        case 'SkipNext':
        case 'ReconcilePlan':
            return true;
        default:
            return false;
    }
}

/**
 * Map a register() port result to the domain settlement ADT:
 *   { tag: 'Registered' } | { tag: 'Partial', failedKeys } | { tag: 'Failed', code, failedKeys }
 */
function toRegistrationOutcome(result, intents) {
    if (result.tag === 'Ok') {
        return { tag: 'Registered' };
    }
    const details = (result.error && result.error.details) || {};
    const failed = ((details.failed || []).map(function (item) {
        return item && item.key;
    })).filter(function (key) {
        return typeof key === 'string';
    });
    const registeredCount = (details.registered || []).length;
    const total = (intents || []).length;
    if (failed.length > 0 && registeredCount > 0 && failed.length < total) {
        return { tag: 'Partial', failedKeys: failed };
    }
    return { tag: 'Failed', code: result.error.code, failedKeys: failed };
}

/**
 * Imperative shell: gather facts through ports, run the pure decision,
 * execute business effects, settle lifecycle events against effect results,
 * evolve state, and persist the final snapshot.
 *
 * Facts are never read inside the domain; they are collected here.
 * The domain never sees platform errors: they are mapped to domain errors.
 */
export function createCommandHandler(ports) {
    return function handleCommand(state, command, options) {
        const opts = options || {};

        const clockResult = ports.clock.now();
        if (clockResult.tag === 'Err') {
            return { tag: 'Err', error: clockResult.error, state: state };
        }
        const now = clockResult.value;
        // Shell-boundary guard: never let a malformed clock value reach the domain.
        if (!isValidInstant(now)) {
            return {
                tag: 'Err',
                error: domainError(ERROR_CODES.INVALID_INSTANT, now),
                state: state
            };
        }

        const offsetResult = ports.calendar.utcOffset(now);
        if (offsetResult.tag === 'Err') {
            return { tag: 'Err', error: offsetResult.error, state: state };
        }
        const wallResult = ports.calendar.localWall(now, offsetResult.value);
        if (wallResult.tag === 'Err') {
            return { tag: 'Err', error: wallResult.error, state: state };
        }

        // Precision facts: only commands that diff against the registered plan
        // pay for listRegistered; a failure there must never be read as "empty".
        let registeredPlan = [];
        let listFailure;
        if (commandNeedsRegisteredPlan(command)) {
            const listResult = ports.reminders.listRegistered(NAMESPACE);
            if (listResult.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'RegisteredListFailed',
                    code: listResult.error.code,
                    at: now
                }));
                return {
                    tag: 'Err',
                    error: domainError(ERROR_CODES.REMINDER_LIST_UNAVAILABLE, listResult.error),
                    state: state
                };
            }
            registeredPlan = listResult.value;
        }

        const facts = Object.freeze({
            now: now,
            localWall: wallResult.value,
            utcOffsetMinutes: offsetResult.value,
            registeredPlan: registeredPlan,
            horizonDays: DEFAULT_HORIZON_DAYS
        });

        // Startup/periodic reduction of expired sessions and pauses.
        let currentState = state;
        if (opts.reduceTemporal !== false) {
            const reduceResult = reduceTemporalState(state, now);
            if (reduceResult.tag === 'Ok') {
                currentState = reduceResult.value;
            }
        }

        const decisionResult = decide(currentState, command, facts);
        if (decisionResult.tag === 'Err') {
            return {
                tag: 'Err',
                error: decisionResult.error,
                state: currentState,
                facts: facts
            };
        }
        const decision = decisionResult.value;

        // 1) Execute business effects and collect per-effect reports.
        const results = [];
        let registration;
        for (let index = 0; index < decision.effects.length; index += 1) {
            const effect = decision.effects[index];
            const result = interpretEffect(effect, ports);
            results.push(Object.freeze({ effectTag: effect.tag, result: result }));
            if (effect.tag === 'RegisterReminders') {
                registration = toRegistrationOutcome(result, effect.intents);
            }
            if (result.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'EffectFailed',
                    effect: effect.tag,
                    code: result.error.code,
                    at: now
                }));
            }
        }

        // 2) Settle lifecycle events against the registration outcome: the
        //    domain never claims Enabled unless the system really registered.
        const settled = settlePlanLifecycle(currentState, decision.events, registration);
        if (settled.tag === 'Err') {
            return {
                tag: 'Err',
                error: settled.error,
                state: currentState,
                decision: decision,
                results: results
            };
        }
        const events = settled.value;

        // 3) Evolve with the settled events.
        const evolved = evolveAll(currentState, events);
        if (evolved.tag === 'Err') {
            return {
                tag: 'Err',
                error: evolved.error,
                state: currentState,
                decision: decision,
                results: results
            };
        }

        // 4) Persist the final state (shell-owned, after settlement).
        if (events.length > 0) {
            const persist = ports.store.saveSnapshot(currentState.revision, createSnapshot(evolved.value));
            if (persist.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'EffectFailed',
                    effect: 'PersistSnapshot',
                    code: persist.error.code,
                    at: now
                }));
            }
            results.push(Object.freeze({ effectTag: 'PersistSnapshot', result: persist }));
        }

        return {
            tag: 'Ok',
            state: evolved.value,
            decision: decision,
            appliedEvents: events,
            results: results,
            facts: facts,
            listFailure: listFailure
        };
    };
}
