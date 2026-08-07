const nativeVibrator = typeof requireNative === 'function'
    ? requireNative('system.vibrator')
    : {};

export default nativeVibrator;
