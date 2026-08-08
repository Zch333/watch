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

function formatSeconds(seconds) {
    var safe = typeof seconds === 'number' && seconds >= 0 ? Math.floor(seconds) : 0;
    var minutes = Math.floor(safe / 60);
    var remainder = safe % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' +
        (remainder < 10 ? '0' : '') + remainder;
}

function errorText(model) {
    var errors = model && model.errors ? model.errors : [];
    var error = errors.length > 0 ? errors[errors.length - 1] : null;
    return error ? (error.text || error.code || '操作失败') : '操作失败';
}

function scheduleVisibleTimer(callback, delay) {
    if (typeof setTimeout !== 'function') {
        return -1;
    }
    try {
        return setTimeout(callback, delay);
    } catch (error) {
        return -1;
    }
}

function cancelVisibleTimer(timerId) {
    if (timerId < 0 || typeof clearTimeout !== 'function') {
        return;
    }
    try {
        clearTimeout(timerId);
    } catch (error) {
        // A missing timer implementation must not make the page unusable.
    }
}

export default {
    data: {
        remainingText: '05:00',
        guidanceText: '',
        hasGuidance: false,
        finished: false,
        showActiveControls: true,
        showFinished: false,
        hasError: false,
        errorText: ''
    },
    timerId: -1,
    elapsedDispatched: false,

    onInit() {
        this.elapsedDispatched = false;
        this.syncModel();
        this.startVisibleTicker();
    },
    onReady() {
        this.syncModel();
        this.startVisibleTicker();
    },
    onShow() {
        this.elapsedDispatched = false;
        this.syncModel();
        this.startVisibleTicker();
    },
    onHide() {
        this.stopVisibleTicker();
    },
    onDestroy() {
        this.stopVisibleTicker();
    },
    syncModel() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用运行时不可用，请重新打开应用';
            return;
        }
        var model = app.refresh();
        this.remainingText = formatSeconds(model.remainingSeconds);
        var actions = model.currentGuidance ? model.currentGuidance.actions : [];
        this.guidanceText = actions && actions.length > 0 ? String(actions[0]) : '';
        this.hasGuidance = this.guidanceText.length > 0;
        this.finished = model.breakStatus === 'Finished';
        this.showActiveControls = !this.finished;
        this.showFinished = this.finished;
    },
    render() {
        this.syncModel();
    },
    startVisibleTicker() {
        this.stopVisibleTicker();
        var self = this;
        var tick = function () {
            var app = runtime();
            if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
                self.timerId = scheduleVisibleTimer(tick, 250);
                return;
            }
            var model = app.refresh();
            self.remainingText = formatSeconds(model.remainingSeconds);
            var actions = model.currentGuidance ? model.currentGuidance.actions : [];
            self.guidanceText = actions && actions.length > 0 ? String(actions[0]) : '';
            self.hasGuidance = self.guidanceText.length > 0;
            self.finished = model.breakStatus === 'Finished';
            self.showActiveControls = !self.finished;
            self.showFinished = self.finished;
            if (self.elapsedDispatched) {
                return;
            }
            if (model.breakStatus === 'Active' && model.remainingSeconds > 0) {
                self.timerId = scheduleVisibleTimer(tick, 1000);
                return;
            }
            self.elapsedDispatched = true;
            self.stopVisibleTicker();
            var next = app.dispatch({ tag: 'BreakElapsed' });
            if ((next.errors || []).length === 0) {
                app.navigateTo('home');
                return;
            }
            self.hasError = true;
            self.errorText = errorText(next);
        };
        this.timerId = scheduleVisibleTimer(tick, 1000);
    },
    stopVisibleTicker() {
        if (this.timerId >= 0) {
            cancelVisibleTimer(this.timerId);
            this.timerId = -1;
        }
    },
    afterAction(model) {
        if (!model || (model.errors || []).length === 0) {
            return;
        }
        this.hasError = true;
        this.errorText = errorText(model);
        this.syncModel();
    },
    onComplete() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        this.stopVisibleTicker();
        var next = app.dispatch({ tag: 'CompletePressed' });
        this.afterAction(next);
        if (!this.hasError && typeof app.navigateTo === 'function') {
            app.navigateTo('home');
        }
    },
    onSkip() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        this.stopVisibleTicker();
        var next = app.dispatch({ tag: 'SkipBreakPressed' });
        this.afterAction(next);
        if (!this.hasError && typeof app.navigateTo === 'function') {
            app.navigateTo('home');
        }
    },
    onHome() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
            return;
        }
        this.stopVisibleTicker();
        if (this.finished) {
            app.dispatch({ tag: 'AckFinishedPressed' });
        }
        if (typeof app.navigateTo === 'function') {
            app.navigateTo('home');
        }
    }
};
