/* Platform effects are injected because the exact Wear Engine Lite SDK surface is approval/version-bound. */
'use strict';

import protocol from './protocol.js';

export function createWearEngineBridge(options) {
    if (!options || !options.transport || !options.crypto || !options.clock || !options.ids) {
        throw new Error('LITE_BRIDGE_DEPENDENCY_REQUIRED');
    }
    var lastReceivedSequence = null;
    var nextSequence = 0;
    var buffer = new protocol.RingBuffer(options.bufferCapacity || 128);

    function send(type, sessionId, payload) {
        var created = protocol.createEnvelope({
            messageId: options.ids.next('watch-message'),
            sessionId: sessionId || null,
            sequence: nextSequence++,
            type: type,
            sentAtEpochMs: options.clock.nowEpochMs(),
            payloadJson: JSON.stringify(payload || {})
        }, options.crypto.sha256Hex);
        if (!created.ok) return Promise.reject(new Error(created.error));
        var encoded = protocol.encode(created.value);
        if (!encoded.ok) return Promise.reject(new Error(encoded.error));
        if (type === 'SAMPLE_BATCH') {
            buffer = buffer.append({
                sequence: created.value.sequence,
                payload: encoded.value,
                checksum: created.value.checksumSha256
            });
        }
        return options.transport.send(encoded.value);
    }

    function receive(wire) {
        var decoded = protocol.decode(wire, lastReceivedSequence, options.crypto.sha256Hex);
        if (!decoded.ok) return decoded;
        if (decoded.value.type !== 'ACK') lastReceivedSequence = decoded.value.sequence;
        if (decoded.value.type === 'ACK') {
            try {
                buffer = buffer.acknowledge(JSON.parse(decoded.value.payloadJson).sequence);
            } catch (failure) {
                return { ok: false, error: 'WATCH_ACK_INVALID' };
            }
        }
        return decoded;
    }

    function replayBuffered() {
        return buffer.items.reduce(function (chain, item) {
            return chain.then(function () { return options.transport.send(item.payload); });
        }, Promise.resolve());
    }

    return {
        sendHello: function (appVersion, capabilities) {
            return send('HELLO', null, { appVersion: appVersion, watchApiLevel: 20, capabilities: capabilities.slice().sort() });
        },
        sendCapabilities: function (capabilities) { return send('CAPABILITIES', null, { capabilities: capabilities }); },
        sendSamples: function (sessionId, sensor, samples) { return send('SAMPLE_BATCH', sessionId, { sensor: sensor, samples: samples }); },
        sendError: function (sessionId, code) { return send('ERROR', sessionId, { code: code }); },
        receive: receive,
        replayBuffered: replayBuffered,
        bufferedCount: function () { return buffer.items.length; }
    };
}
