/* API-20 Lite Wearable compatible ES5 contract. No Node/browser globals are required. */
'use strict';

var PROTOCOL_VERSION = 1;
var MAX_PAYLOAD_BYTES = 960;
var MAX_WIRE_BYTES = 1024;

function utf8Length(value) {
    return unescape(encodeURIComponent(value)).length;
}

function canonical(value) {
    return value.protocolVersion + '|' + value.messageId + '|' + (value.sessionId || '') + '|' +
        value.sequence + '|' + value.type + '|' + value.sentAtEpochMs + '|' + value.payloadJson;
}

function createEnvelope(input, sha256Hex) {
    if (!input.messageId || input.sequence < 0 || input.sentAtEpochMs <= 0) {
        return { ok: false, error: 'WATCH_ENVELOPE_IDENTITY_INVALID' };
    }
    if (utf8Length(input.payloadJson) > MAX_PAYLOAD_BYTES) {
        return { ok: false, error: 'WEAR_ENGINE_MESSAGE_TOO_LARGE' };
    }
    var envelope = {
        protocolVersion: PROTOCOL_VERSION,
        messageId: input.messageId,
        sessionId: input.sessionId || null,
        sequence: input.sequence,
        type: input.type,
        sentAtEpochMs: input.sentAtEpochMs,
        payloadJson: input.payloadJson,
        checksumSha256: ''
    };
    envelope.checksumSha256 = sha256Hex(canonical(envelope));
    return { ok: true, value: envelope };
}

function validateEnvelope(envelope, lastSequence, sha256Hex) {
    if (!envelope || envelope.protocolVersion !== PROTOCOL_VERSION) {
        return { ok: false, error: 'UNSUPPORTED_WATCH_PROTOCOL' };
    }
    if (utf8Length(envelope.payloadJson) > MAX_PAYLOAD_BYTES) {
        return { ok: false, error: 'WEAR_ENGINE_MESSAGE_TOO_LARGE' };
    }
    if (sha256Hex(canonical(envelope)) !== envelope.checksumSha256) {
        return { ok: false, error: 'WATCH_MESSAGE_CHECKSUM_INVALID' };
    }
    if (lastSequence !== null && lastSequence !== undefined && envelope.sequence <= lastSequence && envelope.type !== 'ACK') {
        return { ok: false, error: 'WATCH_MESSAGE_REPLAYED' };
    }
    return { ok: true, value: envelope };
}

function encode(envelope) {
    var wire = JSON.stringify({
        v: envelope.protocolVersion,
        id: envelope.messageId,
        sid: envelope.sessionId,
        seq: envelope.sequence,
        type: envelope.type,
        at: envelope.sentAtEpochMs,
        payload: envelope.payloadJson,
        sha256: envelope.checksumSha256
    });
    if (utf8Length(wire) > MAX_WIRE_BYTES) {
        return { ok: false, error: 'WEAR_ENGINE_MESSAGE_TOO_LARGE' };
    }
    return { ok: true, value: wire };
}

function decode(wire, lastSequence, sha256Hex) {
    if (utf8Length(wire) > MAX_WIRE_BYTES) {
        return { ok: false, error: 'WEAR_ENGINE_MESSAGE_TOO_LARGE' };
    }
    try {
        var json = JSON.parse(wire);
        return validateEnvelope({
            protocolVersion: json.v,
            messageId: json.id,
            sessionId: json.sid || null,
            sequence: json.seq,
            type: json.type,
            sentAtEpochMs: json.at,
            payloadJson: json.payload,
            checksumSha256: json.sha256
        }, lastSequence, sha256Hex);
    } catch (failure) {
        return { ok: false, error: 'WATCH_WIRE_DECODE_FAILED' };
    }
}

function RingBuffer(capacity, items) {
    if (capacity < 1 || capacity > 4096) throw new Error('RING_BUFFER_CAPACITY_INVALID');
    this.capacity = capacity;
    this.items = (items || []).slice(-capacity);
}

RingBuffer.prototype.append = function (item) {
    return new RingBuffer(this.capacity, this.items.concat([item]));
};

RingBuffer.prototype.acknowledge = function (sequence) {
    return new RingBuffer(this.capacity, this.items.filter(function (item) { return item.sequence > sequence; }));
};

export default {
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
    MAX_WIRE_BYTES: MAX_WIRE_BYTES,
    canonical: canonical,
    createEnvelope: createEnvelope,
    validateEnvelope: validateEnvelope,
    encode: encode,
    decode: decode,
    RingBuffer: RingBuffer
};
