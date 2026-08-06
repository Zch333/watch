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
 * Bound desired plan to strategy capacity.
 */
export function applyStrategyWindow(desiredPlan, strategy) {
    if (!strategy) {
        return desiredPlan || [];
    }
    if (strategy.tag === 'SingleNextStrategy') {
        return Object.freeze((desiredPlan || []).slice(0, 1));
    }
    const maxPending = typeof strategy.maxPendingCount === 'number' ? strategy.maxPendingCount : 30;
    return Object.freeze((desiredPlan || []).slice(0, maxPending));
}
