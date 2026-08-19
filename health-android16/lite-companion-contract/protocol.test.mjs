import test from 'node:test';
import assert from 'node:assert/strict';
import protocol from './protocol.js';

const digest = value => `digest:${value}`;

test('envelope validates integrity, ordering and limits', () => {
    const created = protocol.createEnvelope({
        messageId: 'm1', sessionId: 's1', sequence: 1, type: 'SAMPLE_BATCH',
        sentAtEpochMs: 10, payloadJson: '{}'
    }, digest);
    assert.equal(created.ok, true);
    assert.equal(protocol.validateEnvelope(created.value, 0, digest).ok, true);
    assert.equal(protocol.validateEnvelope({ ...created.value, payloadJson: 'tamper' }, 0, digest).error,
        'WATCH_MESSAGE_CHECKSUM_INVALID');
    assert.equal(protocol.validateEnvelope(created.value, 1, digest).error, 'WATCH_MESSAGE_REPLAYED');
    assert.equal(protocol.createEnvelope({ messageId: 'm2', sequence: 2, type: 'HELLO', sentAtEpochMs: 10,
        payloadJson: 'x'.repeat(961) }, digest).error, 'WEAR_ENGINE_MESSAGE_TOO_LARGE');
});

test('ring buffer is immutable, bounded and acknowledges', () => {
    const empty = new protocol.RingBuffer(2);
    const full = empty.append({ sequence: 1 }).append({ sequence: 2 }).append({ sequence: 3 });
    assert.deepEqual(empty.items, []);
    assert.deepEqual(full.items.map(item => item.sequence), [2, 3]);
    assert.deepEqual(full.acknowledge(2).items.map(item => item.sequence), [3]);
});
