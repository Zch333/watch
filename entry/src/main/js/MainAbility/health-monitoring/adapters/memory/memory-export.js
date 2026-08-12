import { ok } from '../../domain/model.js';

function fhirObservation(item) {
    return Object.freeze({
        resourceType: 'Observation',
        id: item.id,
        status: 'final',
        code: Object.freeze({ text: item.kind }),
        subject: Object.freeze({ reference: 'Patient/' + item.subjectId }),
        effectivePeriod: Object.freeze({
            start: new Date(item.interval.startEpochMs).toISOString(),
            end: new Date(item.interval.endEpochMs).toISOString()
        }),
        valueQuantity: Object.freeze({ value: item.value, unit: item.unit }),
        note: Object.freeze([Object.freeze({ text: 'Consumer wellness data; provenance retained separately.' })])
    });
}

export function createMemoryExportPort(timelineStore) {
    return {
        exportSubject(subjectId, format) {
            const query = timelineStore.query({ subjectId: subjectId });
            if (query.tag === 'Err') { return query; }
            const outputFormat = format || 'json';
            const payload = outputFormat === 'fhir'
                ? Object.freeze({
                    resourceType: 'Bundle', type: 'collection',
                    entry: Object.freeze(query.value.map(function (item) {
                        return Object.freeze({ resource: fhirObservation(item) });
                    }))
                })
                : Object.freeze({ schemaVersion: 1, subjectId: subjectId, observations: query.value });
            return ok(Object.freeze({ format: outputFormat, payload: payload }));
        }
    };
}
