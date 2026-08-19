import { buildAiEnvelope, deterministicReport, validateAiOutput } from '../domain/insight.js';
import { err, ok } from '../domain/model.js';

function parseProviderOutput(result) {
    if (!result || result.tag !== 'Ok') { return result; }
    const raw = result.value;
    if (raw && typeof raw === 'object' && raw.observations) { return ok(raw); }
    try {
        const content = raw.choices[0].message.content;
        return ok(JSON.parse(content));
    } catch (error) {
        return err('AI_RESPONSE_PARSE_FAILED');
    }
}

export function createDualAnalysisEngine(aiInferencePort) {
    return {
        explain(insight, consent, context) {
            const deterministic = deterministicReport(insight);
            const envelope = buildAiEnvelope(insight, consent, context);
            if (envelope.tag === 'Err' || !aiInferencePort) {
                return ok(Object.freeze({
                    tag: 'DeterministicOnly', deterministic: deterministic,
                    ai: null, fallbackReason: envelope.tag === 'Err' ? envelope.error.code : 'AI_NOT_CONFIGURED'
                }));
            }
            const untrusted = aiInferencePort.complete(envelope.value);
            const parsed = parseProviderOutput(untrusted);
            if (parsed.tag === 'Err') {
                return ok(Object.freeze({
                    tag: 'DeterministicOnly', deterministic: deterministic,
                    ai: null, fallbackReason: parsed.error.code
                }));
            }
            const validated = validateAiOutput(parsed.value, envelope.value);
            if (validated.tag === 'Err') {
                return ok(Object.freeze({
                    tag: 'DeterministicOnly', deterministic: deterministic,
                    ai: null, fallbackReason: validated.error.code
                }));
            }
            return ok(Object.freeze({
                tag: 'MergedAnalysis', deterministic: deterministic,
                ai: validated.value, sourceOfTruth: 'deterministic'
            }));
        }
    };
}
