export function ok(value) {
    return Object.freeze({ tag: 'Ok', value: value });
}

export function err(error) {
    return Object.freeze({ tag: 'Err', error: error });
}

