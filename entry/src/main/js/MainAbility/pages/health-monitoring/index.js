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
        return globalObject && globalObject.__MOVE25_HOST_RUNTIME__
            ? globalObject.__MOVE25_HOST_RUNTIME__
            : null;
    }
    try {
        return getApp();
    } catch (error) {
        return null;
    }
}

function textFor(activation) {
    if (!activation || activation.tag === 'Dormant') {
        return '发布开关关闭';
    }
    if (activation.tag === 'DisabledByUser') {
        return '用户开关关闭';
    }
    return '已启用';
}

export default {
    data: {
        statusText: '发布开关关闭',
        detailText: '功能已编译，但不会采集或分析数据',
        switchText: '保留开启意愿',
        userEnabled: false,
        featureCount: 0,
        hasError: false,
        errorText: ''
    },
    onInit() { this.syncStatus(); },
    onReady() { this.syncStatus(); },
    onShow() { this.syncStatus(); },
    syncStatus() {
        var app = runtime();
        if (!app || typeof app.healthMonitoringStatus !== 'function') {
            this.hasError = true;
            this.errorText = '健康监测运行时不可用';
            return;
        }
        var state = app.healthMonitoringStatus();
        this.statusText = textFor(state.activation);
        this.userEnabled = state.userEnabled === true;
        this.switchText = this.userEnabled ? '取消开启意愿' : '保留开启意愿';
        this.featureCount = state.portfolio ? state.portfolio.length : 0;
        this.detailText = state.activation && state.activation.tag === 'Active'
            ? '已允许伴随状态；传感器仍受能力和同意门禁'
            : '功能已编译，但不会采集、同步、分析、上传或提醒';
        this.hasError = false;
        this.errorText = '';
    },
    render() { this.syncStatus(); },
    onToggleIntent() {
        var app = runtime();
        if (!app || typeof app.setHealthMonitoringUserEnabled !== 'function') {
            this.hasError = true;
            this.errorText = '健康监测开关不可用';
            return;
        }
        app.setHealthMonitoringUserEnabled(!this.userEnabled);
        this.syncStatus();
    },
    onHome() {
        var app = runtime();
        if (app && typeof app.navigateTo === 'function') {
            app.navigateTo('home');
        }
    }
};
