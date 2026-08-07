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

function errorText(model) {
    var errors = model && model.errors ? model.errors : [];
    var error = errors.length > 0 ? errors[errors.length - 1] : null;
    return error ? (error.text || error.code || '操作失败') : '操作失败';
}

export default {
    data: {
        reminderKey: '',
        actions: [],
        hasError: false,
        errorText: ''
    },
    onInit() {
        this.hasError = false;
        this.errorText = '';
        this.syncModel();
    },
    onReady() {
        this.syncModel();
    },
    onShow() {
        this.hasError = false;
        this.errorText = '';
        this.syncModel();
    },
    syncModel() {
        var app = runtime();
        if (!app || !app.isReady()) {
            return;
        }
        var model = app.refresh();
        this.reminderKey = model.dueReminderKey || '';
        this.actions = model.currentGuidance ? model.currentGuidance.actions : [];
    },
    render() {
        this.syncModel();
    },
    afterAction(model) {
        if (!model || (model.errors || []).length === 0) {
            return;
        }
        this.hasError = true;
        this.errorText = errorText(model);
    },
    onStart() {
        var app = runtime();
        if (!app || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        this.afterAction(app.dispatch({
            tag: 'StartDuePressed',
            reminderKey: this.reminderKey
        }));
        if (!this.hasError && typeof app.navigateTo === 'function') {
            app.navigateTo('break-active');
        }
    },
    onSkip() {
        var app = runtime();
        if (!app || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        this.afterAction(app.dispatch({ tag: 'SkipBreakPressed' }));
        if (!this.hasError && typeof app.navigateTo === 'function') {
            app.navigateTo('home');
        }
    },
    onHome() {
        var app = runtime();
        if (app) {
            app.navigateTo('home');
        }
    }
};
