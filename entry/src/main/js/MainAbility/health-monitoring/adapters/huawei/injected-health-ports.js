import { err, ok } from '../../domain/model.js';

function requireMethods(client, names, label) {
    const missing = names.filter(function (name) { return !client || typeof client[name] !== 'function'; });
    if (missing.length > 0) {
        throw new Error(label + ' client missing ' + missing.join(', '));
    }
}

export function createAndroidHealthServicePort(client) {
    requireMethods(client, ['capabilities', 'authorize', 'read', 'changes', 'revoke'], 'Android Health Service');
    return {
        capabilities() { return client.capabilities(); },
        requestAuthorization(scopes) { return client.authorize(scopes); },
        read(request) { return client.read(request); },
        changes(cursor) { return client.changes(cursor); },
        revoke(scopes) { return client.revoke(scopes); }
    };
}

export function createHuaweiCloudRestPort(client, credentials) {
    requireMethods(client, ['capabilities', 'read', 'changes', 'revoke'], 'Huawei Cloud REST');
    if (!credentials || credentials.location !== 'server') {
        throw new Error('Huawei cloud credentials must stay on the server');
    }
    return {
        capabilities() { return client.capabilities(credentials); },
        requestAuthorization() {
            return err('AUTHORIZATION_MUST_START_ON_ANDROID');
        },
        read(request) { return client.read(request, credentials); },
        changes(cursor) { return client.changes(cursor, credentials); },
        revoke(scopes) { return client.revoke(scopes, credentials); }
    };
}

export function createUnavailableAndroidHealthServicePort() {
    return {
        capabilities() { return ok(Object.freeze({ tag: 'RequiresApproval', plane: 'android' })); },
        requestAuthorization() { return err('ENTERPRISE_HEALTH_SCOPE_APPROVAL_REQUIRED'); },
        read() { return err('ANDROID_HEALTH_SERVICE_NOT_CONFIGURED'); },
        changes() { return err('ANDROID_HEALTH_SERVICE_NOT_CONFIGURED'); },
        revoke() { return ok(true); }
    };
}

export function createUnavailableHuaweiCloudRestPort() {
    return {
        capabilities() { return ok(Object.freeze({ tag: 'RequiresApproval', plane: 'cloud_rest' })); },
        requestAuthorization() { return err('AUTHORIZATION_MUST_START_ON_ANDROID'); },
        read() { return err('HUAWEI_CLOUD_REST_NOT_CONFIGURED'); },
        changes() { return err('HUAWEI_CLOUD_REST_NOT_CONFIGURED'); },
        revoke() { return ok(true); }
    };
}
