import { activationState } from '../config/release-gate.js';
import { err, ok, withRevision } from './model.js';

function audit(state, entry) {
    return Object.freeze(state.audit.concat([Object.freeze(entry)]).slice(-100));
}

export function decideHealth(state, command, facts) {
    if (!state || state.tag !== 'HealthMonitoringState') {
        return err('INVALID_HEALTH_STATE');
    }
    const cmd = command || {};
    if (cmd.tag === 'SetUserHealthSwitch') {
        const enabled = cmd.enabled === true;
        const nextActivation = activationState(enabled, state.releaseEnabled);
        return ok(Object.freeze({
            state: withRevision(state, {
                userEnabled: enabled,
                activation: nextActivation,
                audit: audit(state, { tag: 'UserSwitchChanged', enabled: enabled, at: facts && facts.now })
            }),
            events: Object.freeze([Object.freeze({ tag: 'UserSwitchChanged', enabled: enabled })]),
            effects: Object.freeze([])
        }));
    }
    if (cmd.tag === 'ObserveHealthCapability') {
        const capabilities = Object.assign({}, state.capabilities);
        capabilities[cmd.id] = Object.freeze(Object.assign({}, cmd.capability));
        return ok(Object.freeze({
            state: withRevision(state, {
                capabilities: Object.freeze(capabilities),
                audit: audit(state, { tag: 'CapabilityObserved', id: cmd.id, capability: cmd.capability.tag })
            }),
            events: Object.freeze([Object.freeze({ tag: 'CapabilityObserved', id: cmd.id })]),
            effects: Object.freeze([])
        }));
    }
    if (cmd.tag === 'GrantHealthConsent' || cmd.tag === 'RevokeHealthConsent') {
        const consents = Object.assign({}, state.consents);
        consents[cmd.scope] = cmd.tag === 'GrantHealthConsent';
        return ok(Object.freeze({
            state: withRevision(state, {
                consents: Object.freeze(consents),
                audit: audit(state, { tag: cmd.tag, scope: cmd.scope, at: facts && facts.now })
            }),
            events: Object.freeze([Object.freeze({ tag: cmd.tag, scope: cmd.scope })]),
            effects: Object.freeze([])
        }));
    }
    // Privacy control is available even while collection is dormant. A user
    // must never have to enable health processing in order to delete it.
    if (cmd.tag === 'DeleteSubjectData') {
        return ok(Object.freeze({
            state: state,
            events: Object.freeze([]),
            effects: Object.freeze([
                Object.freeze({ tag: 'StopHealthCollection' }),
                Object.freeze({ tag: 'RevokePlatformAuthorization' }),
                Object.freeze({ tag: 'DeleteLocalHealthData', subjectId: cmd.subjectId }),
                Object.freeze({ tag: 'DeleteCloudHealthData', subjectId: cmd.subjectId }),
                Object.freeze({ tag: 'DeleteDerivedHealthData', subjectId: cmd.subjectId }),
                Object.freeze({ tag: 'AppendDeletionAudit', subjectId: cmd.subjectId })
            ])
        }));
    }
    if (state.activation.tag !== 'Active') {
        return err('HEALTH_MONITORING_DORMANT', state.activation.reason);
    }
    if (cmd.tag === 'SyncHealthData') {
        if (state.consents[cmd.scope] !== true) {
            return err('CONSENT_REQUIRED', cmd.scope);
        }
        const observed = state.capabilities[cmd.capabilityId];
        if (!observed || observed.tag !== 'Available') {
            return err('CAPABILITY_NOT_AVAILABLE', cmd.capabilityId);
        }
        return ok(Object.freeze({
            state: state,
            events: Object.freeze([]),
            effects: Object.freeze([Object.freeze({
                tag: 'ReadPlatformRecords', scope: cmd.scope, range: cmd.range,
                capabilityId: cmd.capabilityId
            })])
        }));
    }
    if (cmd.tag === 'StartWatchSensorSession') {
        if (state.consents[cmd.scope] !== true) {
            return err('CONSENT_REQUIRED', cmd.scope);
        }
        return ok(Object.freeze({
            state: state,
            events: Object.freeze([]),
            effects: Object.freeze([Object.freeze({ tag: 'OpenWatchSensorSession', request: cmd.request })])
        }));
    }
    return err('UNKNOWN_HEALTH_COMMAND', cmd.tag);
}
