import { activationState } from '../config/release-gate.js';
import { buildPersonalBaseline, compareToBaseline } from '../domain/baseline.js';
import { composeInsight, deterministicReport } from '../domain/insight.js';
import { initialHealthState } from '../domain/model.js';
import { normalizeObservation } from '../domain/observation.js';
import { validateHealthPorts } from '../ports/contracts.js';

function unwrap(result) {
    if (!result || result.tag !== 'Ok') {
        return result;
    }
    return result.value;
}

export function createMobileHealthRuntime(ports, options) {
    const valid = validateHealthPorts(ports);
    if (valid.tag === 'Err') {
        throw new Error('createMobileHealthRuntime: incomplete ports');
    }
    let state = initialHealthState(options);
    const runs = [];

    function requireActive() {
        state = Object.freeze(Object.assign({}, state, {
            activation: activationState(state.userEnabled, state.releaseEnabled)
        }));
        return state.activation.tag === 'Active';
    }

    return {
        state() { return state; },
        setUserEnabled(enabled) {
            state = Object.freeze(Object.assign({}, state, {
                userEnabled: enabled === true,
                activation: activationState(enabled === true, state.releaseEnabled),
                revision: state.revision + 1
            }));
            ports.AuditPort.append({ tag: 'HealthUserSwitchChanged', enabled: enabled === true });
            return { tag: 'Ok', value: state.activation };
        },
        grantConsent(scope) {
            return ports.ConsentStorePort.write(scope, true);
        },
        revokeConsent(scope) {
            const stopped = ports.PlatformHealthPort.revoke([scope]);
            if (stopped.tag === 'Err') { return stopped; }
            return ports.ConsentStorePort.revoke(scope);
        },
        sync(request) {
            if (!requireActive()) {
                return { tag: 'Err', error: { code: 'HEALTH_MONITORING_DORMANT', details: state.activation.reason } };
            }
            const consent = ports.ConsentStorePort.read(request.scope);
            if (consent.tag === 'Err' || consent.value !== true) {
                return { tag: 'Err', error: { code: 'CONSENT_REQUIRED', details: request.scope } };
            }
            const capability = ports.CapabilityStorePort.read(request.capabilityId);
            if (capability.tag === 'Err' || capability.value.tag !== 'Available') {
                return { tag: 'Err', error: { code: 'CAPABILITY_NOT_AVAILABLE', details: request.capabilityId } };
            }
            const raw = ports.PlatformHealthPort.read(request);
            if (raw.tag === 'Err') { return raw; }
            const accepted = [];
            const rejected = [];
            raw.value.forEach(function (record) {
                const normalized = normalizeObservation(Object.assign({}, record, {
                    consentScope: request.scope,
                    ingestedAt: unwrap(ports.ClockPort.now())
                }));
                if (normalized.tag === 'Ok') { accepted.push(normalized.value); }
                else { rejected.push(normalized.error); }
            });
            const stored = ports.TimelineStorePort.append(accepted);
            ports.AuditPort.append({
                tag: 'HealthSyncCompleted', dataType: request.kind || 'all',
                acceptedCount: accepted.length, rejectedCount: rejected.length
            });
            return stored.tag === 'Err' ? stored : {
                tag: 'Ok', value: Object.freeze({
                    accepted: accepted.length, rejected: Object.freeze(rejected), store: stored.value
                })
            };
        },
        analyze(request) {
            if (!requireActive()) {
                return { tag: 'Err', error: { code: 'HEALTH_MONITORING_DORMANT', details: state.activation.reason } };
            }
            const queried = ports.TimelineStorePort.query(request.query || {});
            if (queried.tag === 'Err') { return queried; }
            const metrics = [];
            const failures = [];
            (request.algorithmIds || []).forEach(function (algorithmId) {
                const output = ports.AlgorithmPort.execute({
                    algorithmId: algorithmId,
                    observations: queried.value
                });
                if (output.tag === 'Ok') { metrics.push(output.value); }
                else { failures.push(output.error); }
            });
            const run = Object.freeze({
                tag: 'AnalysisRun',
                id: 'run-' + String(runs.length + 1),
                inputIds: Object.freeze(queried.value.map(function (item) { return item.id; })),
                algorithmIds: Object.freeze((request.algorithmIds || []).slice()),
                outputs: Object.freeze(metrics.slice()),
                failures: Object.freeze(failures.slice())
            });
            runs.push(run);
            ports.AuditPort.append({
                tag: 'HealthAnalysisCompleted', algorithmCount: run.algorithmIds.length,
                outputCount: metrics.length, failureCount: failures.length
            });
            return { tag: 'Ok', value: run };
        },
        baseline(metricId, metrics, options) {
            return buildPersonalBaseline(metricId, metrics, options);
        },
        compare(baseline, metric) { return compareToBaseline(baseline, metric); },
        insight(input) { return composeInsight(input); },
        templateReport(insight) { return deterministicReport(insight); },
        exportSubject(subjectId) {
            if (!requireActive()) {
                return { tag: 'Err', error: { code: 'HEALTH_MONITORING_DORMANT' } };
            }
            return ports.ExportPort
                ? ports.ExportPort.exportSubject(subjectId)
                : { tag: 'Err', error: { code: 'EXPORT_ADAPTER_NOT_CONFIGURED' } };
        },
        deleteSubject(subjectId) {
            const deleted = ports.TimelineStorePort.tombstone(subjectId, {});
            ports.AuditPort.append({ tag: 'HealthSubjectDataDeleted', subjectIdPseudonym: subjectId });
            return deleted;
        },
        analysisRuns() { return Object.freeze(runs.slice()); }
    };
}
