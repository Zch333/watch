import { decide } from '../domain/decide.js';
import { domainError, ERROR_CODES } from '../domain/errors.js';
import { evolveAll, reduceTemporalState } from '../domain/evolve.js';
import { err, ok } from '../domain/result.js';
import { settlePlanLifecycle } from '../domain/settle.js';
import { createSnapshot } from '../domain/snapshot.js';
import { interpretEffect } from './effect-interpreter.js';
import { STORE_ERROR_CODES, storeError } from '../ports/store-port.js';

export const REMINDER_NAMESPACE = 'move25';
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
 *
 * The registration SUBJECT follows the effect mode (P1-01): one-shot mode
 * counts concrete intents and failed entries carry `key`; rule mode counts
 * weekly rules and failed entries carry `ruleKey`. Settlement must judge
 * Partial/Failed against the same subject the platform registered.
 */
function toRegistrationOutcome(result, effect) {
    if (result.tag === 'Ok') {
        return { tag: 'Registered' };
    }
    const details = (result.error && result.error.details) || {};
    const isRuleMode = Array.isArray(effect.recurrenceRules) && effect.recurrenceRules.length > 0;
    const failed = ((details.failed || []).map(function (item) {
        return item && (isRuleMode ? item.ruleKey : item.key);
    })).filter(function (key) {
        return typeof key === 'string';
    });
    const registeredCount = (details.registered || []).length;
    const total = isRuleMode
        ? (effect.recurrenceRules || []).length
        : (effect.intents || []).length;
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
 *
 * Commit protocol: a command only returns Ok when the settled state has been
 * durably persisted. On any failure the caller receives the last committed
 * state (never an unpersisted candidate), so the in-memory revision always
 * matches the stored revision and later saves do not collide forever.
 */
export function createCommandHandler(ports) {
    /**
     * Build a failure result. `committedState` is the state that was already
     * durably stored (or the pre-command state); `candidateState` is only for
     * diagnostics and must never become the global state.
     */
    function commandFailed(error, committedState, decision, results, facts, candidateState) {
        return Object.freeze({
            tag: 'Err',
            error: error,
            state: committedState,
            candidateState: candidateState,
            decision: decision,
            results: results,
            facts: facts
        });
    }

    const handleCommand = function (state, command, options) {
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
        // Fail fast on a calendar port that lacks resolve(): the per-intent
        // resolver fact below would otherwise throw inside the pure decision
        // instead of surfacing an explicit error (CalendarPort/v1 contract).
        if (typeof ports.calendar.resolve !== 'function') {
            return {
                tag: 'Err',
                error: domainError(ERROR_CODES.CALENDAR_RESOLVE_UNAVAILABLE,
                    { missing: 'calendar.resolve' }),
                state: state
            };
        }

        // Precision facts: only commands that diff against the registered plan
        // pay for listRegistered; a failure there must never be read as "empty".
        let registeredPlan = [];
        if (commandNeedsRegisteredPlan(command)) {
            const listResult = ports.reminders.listRegistered(REMINDER_NAMESPACE);
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

        // Per-intent calendar resolver fact: converts each future local time
        // to its absolute instant through the CalendarPort. This is what makes
        // plans correct across DST boundaries — a single current UTC offset
        // is only valid for the present moment (review P1-01).
        const resolveLocal = function (localDateValue, minuteOfDayValue) {
            return ports.calendar.resolve(localDateValue, minuteOfDayValue);
        };

        const facts = Object.freeze({
            now: now,
            localWall: wallResult.value,
            utcOffsetMinutes: offsetResult.value,
            registeredPlan: registeredPlan,
            horizonDays: DEFAULT_HORIZON_DAYS,
            resolveLocal: resolveLocal
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
                // Committed input state: the temporal reduction is
                // deterministic and re-runs on the next command/refresh.
                state: state,
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
                registration = toRegistrationOutcome(result, effect);
            }
            if (result.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'EffectFailed',
                    effect: effect.tag,
                    code: result.error.code,
                    at: now
                }));
                if (effect.tag === 'CancelReminders') {
                    // Cancelling is the user-visible "off" switch: if the
                    // system still holds reminders, we must not evolve and
                    // persist PlanDisabled. The failure is explicit; the next
                    // Disable/Reconcile retries the cleanup (see decide.js).
                    // The returned state is the committed input state: the
                    // temporal reduction is deterministic and re-runs later.
                    return commandFailed(
                        result.error,
                        state,
                        decision,
                        results,
                        facts
                    );
                }
            }
        }

        // 2) Settle lifecycle events against the registration outcome: the
        //    domain never claims Enabled unless the system really registered.
        const settled = settlePlanLifecycle(currentState, decision.events, registration);
        if (settled.tag === 'Err') {
            return commandFailed(
                settled.error,
                state,
                decision,
                results,
                facts
            );
        }
        const events = settled.value;

        // 3) Evolve with the settled events.
        const evolved = evolveAll(currentState, events);
        if (evolved.tag === 'Err') {
            return commandFailed(
                evolved.error,
                state,
                decision,
                results,
                facts
            );
        }
        const candidateState = evolved.value;

        // 4) Persist the final state (shell-owned, after settlement). A failed
        //    save must NOT expose the candidate as committed: the returned
        //    state stays at the last persisted revision so the optimistic
        //    concurrency guard never collides forever, and the next
        //    reconcile/listRegistered pass converges external side effects.
        //
        //    The expected revision is the COMMITTED input revision (state),
        //    never the intermediate temporal reduction's revision: reduction
        //    is deterministic and re-runs after a failure, so a failed save
        //    must leave both in-memory and stored revisions untouched.
        const committedRevision = state.revision;
        if (candidateState.revision !== committedRevision) {
            const snapshot = createSnapshot(candidateState);
            if (typeof ports.store.saveSnapshotAsync === 'function' &&
                (ports.store.asyncOnly === true || typeof opts.onPersistPending === 'function')) {
                if (typeof opts.onPersistPending !== 'function') {
                    const unavailable = storeError(STORE_ERROR_CODES.ASYNC_REQUIRED, {
                        operation: 'saveSnapshot',
                        reason: 'imperative shell callback required'
                    });
                    results.push(Object.freeze({
                        effectTag: 'PersistSnapshot',
                        result: { tag: 'Err', error: unavailable }
                    }));
                    return commandFailed(
                        unavailable,
                        state,
                        decision,
                        results,
                        facts,
                        candidateState
                    );
                }

                const pendingResult = Object.freeze({
                    tag: 'Pending',
                    expectedRevision: committedRevision,
                    revision: candidateState.revision
                });
                results.push(Object.freeze({
                    effectTag: 'PersistSnapshot',
                    result: pendingResult
                }));
                const finishPersist = function (persist) {
                    const settledResults = results.slice();
                    settledResults[settledResults.length - 1] = Object.freeze({
                        effectTag: 'PersistSnapshot',
                        result: persist
                    });
                    if (persist.tag === 'Err') {
                        ports.diagnostics.append(Object.freeze({
                            tag: 'EffectFailed',
                            effect: 'PersistSnapshot',
                            code: persist.error.code,
                            at: now
                        }));
                        opts.onPersistPending(commandFailed(
                            persist.error,
                            state,
                            decision,
                            settledResults,
                            facts,
                            candidateState
                        ));
                        return;
                    }
                    opts.onPersistPending({
                        tag: 'Ok',
                        state: candidateState,
                        decision: decision,
                        appliedEvents: events,
                        results: settledResults,
                        facts: facts
                    });
                };
                try {
                    ports.store.saveSnapshotAsync(
                        committedRevision,
                        snapshot,
                        finishPersist
                    );
                } catch (error) {
                    finishPersist({
                        tag: 'Err',
                        error: storeError(STORE_ERROR_CODES.IO_FAILURE,
                            error && error.message ? error.message : String(error))
                    });
                }
                return Object.freeze({
                    tag: 'Pending',
                    state: state,
                    candidateState: candidateState,
                    decision: decision,
                    results: results,
                    facts: facts
                });
            }

            const persist = ports.store.saveSnapshot(committedRevision, snapshot);
            results.push(Object.freeze({ effectTag: 'PersistSnapshot', result: persist }));
            if (persist.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'EffectFailed',
                    effect: 'PersistSnapshot',
                    code: persist.error.code,
                    at: now
                }));
                return commandFailed(
                    persist.error,
                    state,
                    decision,
                    results,
                    facts,
                    candidateState
                );
            }
        }

        return {
            tag: 'Ok',
            state: candidateState,
            decision: decision,
            appliedEvents: events,
            results: results,
            facts: facts
        };
    };

    /**
     * Imperative-shell entry point for callback based stores. The pure/domain
     * work and all platform effects still run in handleCommand; only the final
     * durable commit is resumed from the adapter callback.
     */
    handleCommand.handleCommandAsync = function (state, command, options, done) {
        const callback = typeof done === 'function' ? done : function () {};
        let settled = false;
        const finish = function (result) {
            if (settled) {
                return;
            }
            settled = true;
            callback(result);
        };
        const opts = Object.assign({}, options || {}, {
            onPersistPending: finish
        });
        let result;
        try {
            result = handleCommand(state, command, opts);
        } catch (error) {
            finish({
                tag: 'Err',
                error: storeError(STORE_ERROR_CODES.IO_FAILURE,
                    error && error.message ? error.message : String(error)),
                state: state
            });
            return { tag: 'Err', error: error, state: state };
        }
        if (result.tag !== 'Pending') {
            finish(result);
        }
        return result;
    };

    return handleCommand;
}
