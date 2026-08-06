import { noPause, noSkip } from './plan.js';
import { defaultScheduleSettings } from './settings.js';
import {
    capabilityUnknown,
    noBreakState,
    planDisabledState
} from './state.js';

/**
 * Aggregate domain state. All fields are immutable values.
 */
export function initialDomainState() {
    return Object.freeze({
        tag: 'DomainState',
        settings: defaultScheduleSettings(),
        planLifecycle: planDisabledState(),
        pause: noPause(),
        skip: noSkip(),
        breakSession: noBreakState(),
        capability: capabilityUnknown(),
        guidanceIndex: 0,
        revision: 0,
        lastReconcileDiff: undefined
    });
}

export function withDomainState(state, patch) {
    return Object.freeze(Object.assign({}, state, patch, { tag: 'DomainState' }));
}
