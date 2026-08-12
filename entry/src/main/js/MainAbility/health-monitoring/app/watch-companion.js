import { activationState } from '../config/release-gate.js';
import { featurePortfolio } from '../domain/feature-registry.js';
import { createRingBuffer, sensorSessionRequest } from '../domain/session.js';

export function createWatchHealthCompanion(options) {
    const input = options || {};
    const buffer = input.buffer || createRingBuffer(input.bufferCapacity || 256);
    const sensorPort = input.sensorPort;
    let releaseEnabled = input.releaseEnabled === true;
    let userEnabled = input.userEnabled === true;
    let capabilities = Object.assign({}, input.capabilities || {});
    let lastSummary = null;

    function activation() {
        return activationState(userEnabled, releaseEnabled);
    }

    return {
        state() {
            const active = activation();
            return Object.freeze({
                activation: active,
                releaseEnabled: releaseEnabled,
                userEnabled: userEnabled,
                summary: lastSummary,
                portfolio: featurePortfolio({
                    activation: active,
                    capabilities: capabilities,
                    researchMode: false,
                    cloudAiEnabled: false
                })
            });
        },
        setUserEnabled(enabled) {
            userEnabled = enabled === true;
            return Object.freeze({ tag: 'Ok', value: activation() });
        },
        observeCapability(id, observed) {
            capabilities = Object.assign({}, capabilities);
            capabilities[id] = Object.freeze(Object.assign({}, observed));
            return Object.freeze({ tag: 'Ok', value: capabilities[id] });
        },
        acceptPhoneSummary(summary) {
            if (activation().tag !== 'Active') {
                return Object.freeze({ tag: 'Err', error: Object.freeze({ code: 'HEALTH_MONITORING_DORMANT' }) });
            }
            lastSummary = Object.freeze(Object.assign({}, summary));
            return Object.freeze({ tag: 'Ok', value: lastSummary });
        },
        startBriefSession(raw) {
            if (activation().tag !== 'Active') {
                return Object.freeze({ tag: 'Err', error: Object.freeze({ code: 'HEALTH_MONITORING_DORMANT' }) });
            }
            const request = sensorSessionRequest(Object.assign({}, raw, { mode: 'Brief' }));
            if (request.tag === 'Err') { return request; }
            if (!sensorPort) {
                return Object.freeze({ tag: 'Err', error: Object.freeze({ code: 'WATCH_SENSOR_PORT_NOT_CONFIGURED' }) });
            }
            return sensorPort.open(request.value);
        },
        cacheSample(sample) { return buffer.append(sample); },
        pendingSamples() { return buffer.read(); },
        acknowledgeSamples(sequence) { return buffer.acknowledge(sequence); }
    };
}
