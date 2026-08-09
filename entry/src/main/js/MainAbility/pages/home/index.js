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
        if (app && typeof app.start === 'function') {
            app.start();
        }
        return app;
    } catch (error) {
        return null;
    }
}

function statusText(tag) {
    var labels = {
        Disabled: '已关闭',
        Enabling: '启用中',
        Enabled: '已启用',
        Paused: '已暂停',
        Blocked: '能力受阻',
        Unknown: '未知'
    };
    return labels[tag] || tag || '未知';
}

var BANNER_COLORS = {
    ok: '#7cd07c',
    warn: '#ffcc00',
    error: '#ff6b6b'
};

function scheduleBootstrapTimer(callback, delay) {
    if (typeof setTimeout !== 'function') {
        return -1;
    }
    try {
        return setTimeout(callback, delay);
    } catch (error) {
        return -1;
    }
}

function cancelBootstrapTimer(timerId) {
    if (timerId < 0 || typeof clearTimeout !== 'function') {
        return;
    }
    try {
        clearTimeout(timerId);
    } catch (error) {
        // Timer support is optional in the Lite previewer.
    }
}

export default {
    data: {
        capabilityText: '正在加载应用…',
        bannerColor: '#ffcc00',
        planStatusText: '未知',
        nextBreak: '—',
        canSchedule: false,
        showScheduleHint: true,
        toggleText: '启用计划',
        hasError: false,
        errorText: ''
    },
    readyTimerId: -1,
    readyAttempts: 0,

    onInit() {
        this.syncModel();
        this.waitForBootstrap();
    },
    onReady() {
        this.syncModel();
        this.waitForBootstrap();
    },
    onShow() {
        this.syncModel();
        this.waitForBootstrap();
    },
    onHide() {
        this.stopBootstrapWait();
    },
    onDestroy() {
        this.stopBootstrapWait();
    },
    waitForBootstrap() {
        this.stopBootstrapWait();
        this.readyAttempts = 0;
        var self = this;
        var check = function () {
            var app = runtime();
            if (app && typeof app.isReady === 'function' && app.isReady()) {
                self.syncModel();
                self.readyTimerId = -1;
                return;
            }
            self.readyAttempts += 1;
            if (self.readyAttempts < 30) {
                self.readyTimerId = scheduleBootstrapTimer(check, 100);
            } else if (app && typeof app.startError === 'function') {
                var startupError = app.startError();
                if (startupError) {
                    self.hasError = true;
                    self.errorText = String(startupError);
                }
            }
        };
        check();
    },
    stopBootstrapWait() {
        if (this.readyTimerId >= 0) {
            cancelBootstrapTimer(this.readyTimerId);
            this.readyTimerId = -1;
        }
    },
    syncModel() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady()) {
            this.capabilityText = '正在读取本地设置…';
            this.bannerColor = BANNER_COLORS.warn;
            this.planStatusText = '初始化中';
            this.nextBreak = '—';
            this.canSchedule = false;
            this.showScheduleHint = true;
            this.toggleText = '启用计划';
            // Keep a concrete startup failure visible instead of silently
            // presenting an endless loading state.
            if (app && typeof app.startError === 'function' && app.startError()) {
                this.hasError = true;
                this.errorText = String(app.startError());
            }
            return;
        }
        var model = app.refresh();
        var banner = model.capabilityBanner || {};
        this.capabilityText = banner.text || '提醒能力未确认';
        this.bannerColor = BANNER_COLORS[banner.level] || BANNER_COLORS.warn;
        this.planStatusText = statusText(model.planStatus);
        this.nextBreak = model.nextBreakText || '—';
        this.canSchedule = !!model.canSchedule;
        this.showScheduleHint = !this.canSchedule;
        this.toggleText = model.planStatus === 'Enabled' || model.planStatus === 'Paused'
            ? '关闭计划'
            : '启用计划';
        var errors = model.errors || [];
        this.hasError = errors.length > 0;
        this.errorText = errors.length > 0
            ? (errors[errors.length - 1].text || errors[errors.length - 1].code || '操作失败')
            : '';
    },
    // Host tests call render(); Lite's generated wrapper replaces that name
    // with the HML render function, so product code uses syncModel().
    render() {
        this.syncModel();
    },
    onStartNow() {
        var app = runtime();
        if (!app || typeof app.isReady !== 'function' || !app.isReady() ||
            typeof app.dispatch !== 'function') {
            this.errorText = '应用仍在初始化，请稍候';
            this.hasError = true;
            return;
        }
        this.hasError = false;
        this.errorText = '';
        var page = this;
        try {
            app.dispatch({ tag: 'StartNowPressed' }, function (nextModel, result) {
                var errors = nextModel && nextModel.errors ? nextModel.errors : [];
                if (!result || result.tag !== 'Ok' || errors.length > 0) {
                    page.hasError = true;
                    page.errorText = errors.length > 0
                        ? (errors[errors.length - 1].text || errors[errors.length - 1].code || '无法开始活动')
                        : '无法开始活动';
                    return;
                }
                if (typeof app.navigateTo !== 'function') {
                    page.errorText = '应用导航不可用';
                    page.hasError = true;
                    return;
                }
                var navigation = app.navigateTo('break-active');
                if (navigation && navigation.tag === 'Err') {
                    page.hasError = true;
                    page.errorText = '无法打开活动页面';
                }
            });
        } catch (error) {
            this.errorText = '无法开始活动';
            this.hasError = true;
        }
    },
    onToggle() {
        var app = runtime();
        if (!app || !app.isReady()) {
            this.syncModel();
            return;
        }
        var model = app.refresh();
        if (!model.canSchedule) {
            this.syncModel();
            return;
        }
        var message = model.planStatus === 'Enabled' || model.planStatus === 'Paused'
            ? { tag: 'DisablePressed' }
            : { tag: 'EnablePressed' };
        var page = this;
        app.dispatch(message, function () {
            page.syncModel();
        });
    },
    onMore() {
        var app = runtime();
        if (!app || typeof app.navigateTo !== 'function') {
            this.hasError = true;
            this.errorText = '应用导航不可用';
            return;
        }
        try {
            var result = app.navigateTo('more');
            if (result && result.tag === 'Err') {
                this.hasError = true;
                this.errorText = '无法打开更多页面';
            }
        } catch (error) {
            this.hasError = true;
            this.errorText = '无法打开更多页面';
        }
    }
};
