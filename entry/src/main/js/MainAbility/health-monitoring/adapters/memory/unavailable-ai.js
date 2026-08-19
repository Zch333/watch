import { err } from '../../domain/model.js';

export function createUnavailableAiInferencePort() {
    return {
        complete() {
            return err('AI_PROVIDER_NOT_CONFIGURED', 'Use deterministic template report');
        }
    };
}
