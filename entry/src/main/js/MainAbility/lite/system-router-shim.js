const nativeRouter = typeof requireNative === 'function'
    ? requireNative('system.router')
    : {};

export default nativeRouter;
