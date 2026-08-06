import { domainError, ERROR_CODES } from './errors.js';
import { planBlocked, planEnabled } from './events.js';
import { err, ok } from './result.js';

/**
 * settlePlanLifecycle(state, events, registration) -> Result<DomainError, DomainEvent[]>
 *
 * Pure. The imperative shell executes the decision's business effects and
 * feeds the registration outcome back here as a value; this function decides
 * whether a final "Enabled" claim may stand.
 *
 * registration (supplied by the shell, never read from the platform):
 *   - undefined / { tag: 'Registered' }            -> registration succeeded
 *   - { tag: 'Partial', failedKeys }               -> some keys failed
 *   - { tag: 'Failed', code, failedKeys }          -> registration failed
 *
 * Rules:
 *   - A decision's PlanEnabled event only survives when registration fully
 *     succeeded. Otherwise the plan must never claim "Enabled".
 *   - Partial failure: drop the PlanEnabled claim and stay Enabling; the next
 *     reconcile retries the missing keys and promotes to Enabled.
 *   - Total failure: replace PlanEnabled with PlanBlocked so the UI shows the
 *     real state instead of a fake "已启用".
 *   - A ReconcilePlan that completes a pending enablement (state Enabling)
 *     appends PlanEnabled once registration is fully successful.
 */
export function settlePlanLifecycle(state, events, registration) {
    const list = events || [];
    const hasEnable = list.some(function (event) {
        return event.tag === 'PlanEnabled';
    });
    const awaiting = !!(state && state.planLifecycle && state.planLifecycle.tag === 'Enabling');

    // A decision that claims Enabled must always be backed by a registration
    // outcome. Missing means the shell lost the effect report — that is a
    // shell defect, never a silent success.
    if (hasEnable && !registration) {
        return err(domainError(ERROR_CODES.MISSING_REGISTRATION_OUTCOME, Object.freeze({
            tag: 'MissingRegistrationOutcome',
            events: list.map(function (event) {
                return event.tag;
            })
        })));
    }

    if (!registration || registration.tag === 'Registered') {
        if (hasEnable || !awaiting) {
            return ok(list);
        }
        // A later command (e.g. ReconcilePlan) completed the pending enable.
        return ok(list.concat([planEnabled()]));
    }

    if (registration.tag === 'Partial') {
        // Never claim Enabled while part of the desired plan is not registered.
        return ok(hasEnable
            ? list.filter(function (event) {
                return event.tag !== 'PlanEnabled';
            })
            : list);
    }

    // Total failure: block instead of claiming Enabled.
    const blocked = planBlocked(domainError(ERROR_CODES.REMINDER_REGISTRATION_FAILED, {
        tag: 'RegistrationFailed',
        code: registration.code,
        failedKeys: registration.failedKeys || []
    }));
    if (hasEnable) {
        return ok(list.map(function (event) {
            return event.tag === 'PlanEnabled' ? blocked : event;
        }));
    }
    if (awaiting) {
        return ok(list.concat([blocked]));
    }
    return ok(list);
}
