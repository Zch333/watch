function runtime() {
    var globalObject = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof global !== 'undefined' ? global : null);
    if (globalObject && globalObject.__MOVE25_LITE_RUNTIME__) {
        var liteApp = globalObject.__MOVE25_LITE_RUNTIME__;
        if (liteApp && typeof liteApp.start === 'function') {
            liteApp.start();
        }
        return liteApp;
    }
    if (typeof getApp !== 'function') {
        if (globalObject && globalObject.__MOVE25_HOST_RUNTIME__) {
            return globalObject.__MOVE25_HOST_RUNTIME__;
        }
        return null;
    }
    try {
        var app = getApp();
        if (app && app.start) {
            app.start();
        }
        return app;
    } catch (error) {
        return null;
    }
}

function lastError(model) {
    var errors = model && model.errors ? model.errors : [];
    var error = errors.length > 0 ? errors[errors.length - 1] : null;
    return error ? (error.text || error.code || '操作失败') : '操作失败';
}

export default {
    data: {
        hasError: false,
        errorText: ''
    },
    onInit() {
        this.hasError = false;
        this.errorText = '';
    },
    onReady() {
        this.syncModel();
    },
    onShow() {
        this.hasError = false;
        this.errorText = '';
    },
    syncModel() {
        var app = runtime();
        if (!app || !app.isReady()) {
            return;
        }
        var model = app.refresh();
        this.hasError = (model.errors || []).length > 0;
        this.errorText = this.hasError ? lastError(model) : '';
    },
    // Host tests call render(); Lite's generated wrapper reserves that name
    // for the compiled HML template.
    render() {
        this.syncModel();
    },
    onPauseToday() {
        this.runAction({ tag: 'PauseTodayPressed' });
    },
    onPauseHour() {
        this.runAction({ tag: 'PauseOneHourPressed' });
    },
    onSkipNext() {
        this.runAction({ tag: 'SkipNextPressed' });
    },
    onSettings() {
        var app = runtime();
        if (app) {
            app.navigateTo('settings');
        }
    },
    onDiagnostics() {
        var app = runtime();
        if (app) {
            app.navigateTo('diagnostics');
        }
    },
    runAction(message) {
        var app = runtime();
        if (!app || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        this.hasError = false;
        this.errorText = '';
        var page = this;
        app.dispatch(message, function (nextModel, result) {
            if (!result || result.tag !== 'Ok' || (nextModel.errors || []).length > 0) {
                page.hasError = true;
                page.errorText = lastError(nextModel);
                return;
            }
            app.navigateTo('home');
        });
    }
};
