export function some(value) {
    return Object.freeze({ tag: 'Some', value: value });
}

export function none() {
    return Object.freeze({ tag: 'None' });
}

export function isSome(option) {
    return typeof option === 'object' && option !== null && option.tag === 'Some';
}

export function isNone(option) {
    return typeof option === 'object' && option !== null && option.tag === 'None';
}
