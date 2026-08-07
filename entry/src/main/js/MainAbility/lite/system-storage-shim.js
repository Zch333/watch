const nativeStorage = typeof requireNative === 'function'
    ? requireNative('system.storage')
    : {};

export default nativeStorage;
