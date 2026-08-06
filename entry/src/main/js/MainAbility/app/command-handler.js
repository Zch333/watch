import { decide } from '../domain/decide.js';
import { evolveAll, reduceTemporalState } from '../domain/evolve.js';
import { err, ok } from '../domain/result.js';
import { interpretEffect } from './effect-interpreter.js';

const NAMESPACE = 'move25';
const DEFAULT_HORIZON_DAYS = 3;

/**
 * Imperative shell: gather facts through ports, run the pure decision,
 * interpret effects, evolve state, and surface per-effect results.
 *
 * Facts are never read inside the domain; they are collected here.
 */
export function createCommandHandler(ports) {
    return function handleCommand(state, command, options) {
        const opts = options || {};

        const clockResult = ports.clock.now();
        if (clockResult.tag === 'Err') {
            return { tag: 'Err', error: clockResult.error, state: state };
        }
        const now = clockResult.value;

        const offsetResult = ports.calendar.utcOffset(now);
        if (offsetResult.tag === 'Err') {
            return { tag: 'Err', error: offsetResult.error, state: state };
        }
        const wallResult = ports.calendar.localWall(now, offsetResult.value);
        if (wallResult.tag === 'Err') {
            return { tag: 'Err', error: wallResult.error, state: state };
        }

        let registeredPlan = [];
        let listFailure;
        const listResult = ports.reminders.listRegistered(NAMESPACE);
        if (listResult.tag === 'Ok') {
            registeredPlan = listResult.value;
        } else {
            listFailure = listResult.error;
            ports.diagnostics.append(Object.freeze({
                tag: 'RegisteredListFailed',
                code: listResult.error.code,
                at: now
            }));
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

        const results = [];
        for (let index = 0; index < decision.effects.length; index += 1) {
            const effect = decision.effects[index];
            const result = interpretEffect(effect, ports, {
                expectedRevision: currentState.revision
            });
            results.push(Object.freeze({ effectTag: effect.tag, result: result }));
            if (result.tag === 'Err') {
                ports.diagnostics.append(Object.freeze({
                    tag: 'EffectFailed',
                    effect: effect.tag,
                    code: result.error.code,
                    at: now
                }));
            }
        }

        const evolved = evolveAll(currentState, decision.events);
        if (evolved.tag === 'Err') {
            return {
                tag: 'Err',
                error: evolved.error,
                state: currentState,
                decision: decision,
                results: results
            };
        }

        return {
            tag: 'Ok',
            state: evolved.value,
            decision: decision,
            results: results,
            facts: facts,
            listFailure: listFailure
        };
    };
}
