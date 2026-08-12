import { err, ok } from '../domain/model.js';

const CONTRACTS = Object.freeze({
    PlatformHealthPort: Object.freeze(['capabilities', 'requestAuthorization', 'read', 'changes', 'revoke']),
    WatchSensorPort: Object.freeze(['listSensors', 'open', 'close']),
    TimelineStorePort: Object.freeze(['append', 'query', 'tombstone', 'transaction']),
    ConsentStorePort: Object.freeze(['read', 'write', 'revoke']),
    CapabilityStorePort: Object.freeze(['read', 'write']),
    AlgorithmPort: Object.freeze(['describe', 'execute']),
    AiInferencePort: Object.freeze(['complete']),
    ExportPort: Object.freeze(['exportSubject']),
    AuditPort: Object.freeze(['append', 'readRecent']),
    NotificationPort: Object.freeze(['publish']),
    ClockPort: Object.freeze(['now'])
});

export function portContract(name) {
    return CONTRACTS[name] || null;
}

export function validatePort(name, candidate) {
    const methods = CONTRACTS[name];
    if (!methods) {
        return err('UNKNOWN_PORT_CONTRACT', name);
    }
    const missing = methods.filter(function (method) {
        return !candidate || typeof candidate[method] !== 'function';
    });
    return missing.length === 0
        ? ok(Object.freeze({ name: name, methods: methods }))
        : err('PORT_CONTRACT_INCOMPLETE', { name: name, missing: missing });
}

export function validateHealthPorts(ports) {
    const required = [
        'PlatformHealthPort', 'TimelineStorePort', 'ConsentStorePort',
        'CapabilityStorePort', 'AlgorithmPort', 'AuditPort', 'ClockPort'
    ];
    const failures = [];
    for (let index = 0; index < required.length; index += 1) {
        const result = validatePort(required[index], ports && ports[required[index]]);
        if (result.tag === 'Err') {
            failures.push(result.error);
        }
    }
    return failures.length === 0 ? ok(true) : err('HEALTH_PORTS_INVALID', failures);
}
