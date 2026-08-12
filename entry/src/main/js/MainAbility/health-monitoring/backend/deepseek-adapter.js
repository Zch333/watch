import { err, ok } from '../domain/model.js';

export function createDeepSeekServerAdapter(httpClient, configuration) {
    const config = configuration || {};
    if (config.executionTier !== 'server') {
        throw new Error('DeepSeek adapter is server-only; never embed the API key in Android or watch code');
    }
    if (!config.apiKeyProvider || typeof config.apiKeyProvider.read !== 'function') {
        throw new Error('DeepSeek server credential provider is required');
    }
    if (!httpClient || typeof httpClient.postJson !== 'function') {
        throw new Error('DeepSeek HTTP client is required');
    }
    return {
        complete(envelope) {
            const secret = config.apiKeyProvider.read();
            if (!secret || secret.tag !== 'Ok' || !secret.value) {
                return err('DEEPSEEK_CREDENTIAL_UNAVAILABLE');
            }
            const body = Object.freeze({
                model: config.model || 'configured-deepseek-model',
                response_format: Object.freeze({ type: 'json_object' }),
                temperature: 0,
                messages: Object.freeze([
                    Object.freeze({
                        role: 'system',
                        content: '只解释已验证的健康事实。不得诊断、调整药物、修改数值或遗漏确定性红旗。返回JSON。'
                    }),
                    Object.freeze({ role: 'user', content: JSON.stringify(envelope) })
                ])
            });
            // Credential exists only in this server adapter and is never
            // returned, logged or included in the request body.
            const response = httpClient.postJson('/chat/completions', body, {
                Authorization: 'Bearer ' + secret.value
            });
            return response && response.tag ? response : ok(response);
        }
    };
}
