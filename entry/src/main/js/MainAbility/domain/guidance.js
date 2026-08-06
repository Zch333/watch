/**
 * Deterministic activity guidance rotation.
 * No Math.random — reproducible in tests and across restarts.
 */
const GUIDANCE_SEQUENCE = Object.freeze([
    Object.freeze({
        id: 'stand-walk-eyes',
        actions: Object.freeze(['stand_and_walk', 'simple_stretch', 'look_far'])
    }),
    Object.freeze({
        id: 'neck-shoulder-eyes',
        actions: Object.freeze(['neck_rolls', 'shoulder_open', 'look_far'])
    }),
    Object.freeze({
        id: 'hip-ankle-eyes',
        actions: Object.freeze(['hip_circles', 'ankle_flex', 'look_far'])
    }),
    Object.freeze({
        id: 'wrist-back-eyes',
        actions: Object.freeze(['wrist_stretch', 'back_extension', 'look_far'])
    })
]);

export function guidanceCount() {
    return GUIDANCE_SEQUENCE.length;
}

export function guidanceAt(index) {
    const safeIndex = ((index % GUIDANCE_SEQUENCE.length) + GUIDANCE_SEQUENCE.length) %
        GUIDANCE_SEQUENCE.length;
    return GUIDANCE_SEQUENCE[safeIndex];
}

/**
 * @param {number} nextIndex - monotonic counter stored in domain state
 * @returns {{ guidance: object, nextIndex: number }}
 */
export function selectNextGuidance(nextIndex) {
    const normalized = typeof nextIndex === 'number' && nextIndex >= 0 ? nextIndex : 0;
    return Object.freeze({
        guidance: guidanceAt(normalized),
        nextIndex: normalized + 1
    });
}

export function listGuidance() {
    return GUIDANCE_SEQUENCE;
}
