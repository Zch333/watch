import { err } from '../../domain/model.js';
import { executeAlgorithm, findAlgorithm } from '../../domain/metrics.js';

export function createBuiltinAlgorithmPort() {
    return {
        describe(id) {
            return findAlgorithm(id) || err('ALGORITHM_NOT_REGISTERED', id);
        },
        execute(request) {
            const input = request || {};
            return executeAlgorithm(input.algorithmId, input.observations || []);
        }
    };
}
