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

function formatOffset(minutes) {
    if (typeof minutes !== 'number') {
        return 'Unknown';
    }
    var sign = minutes < 0 ? '-' : '+';
    var absolute = Math.abs(minutes);
    var hours = Math.floor(absolute / 60);
    var rest = absolute % 60;
    return 'UTC' + sign + (hours < 10 ? '0' : '') + hours + ':' +
        (rest < 10 ? '0' : '') + rest;
}

export default {
    data: {
        planStatus: 'Unknown',
        capability: 'Unknown',
        registeredCount: 0,
        storeRevision: 0,
        storeState: 'Unknown',
        sdkLabel: 'Lite API 24',
        buildSha: 'unknown',
        timezone: 'Unknown',
        hapticsState: 'Unknown',
        deliveryMode: 'ManualOnly',
        lastError: 'None',
        entries: [],
        entriesText: '',
        hasEntries: false
    },
    onInit() {
        this.syncModel();
    },
    onReady() {
        this.syncModel();
    },
    onShow() {
        this.syncModel();
    },
    syncModel() {
        var app = runtime();
        if (!app || !app.isReady()) {
            this.planStatus = '初始化中';
            this.capability = 'Unknown';
            return;
        }
        var snapshot = app.diagnosticsSnapshot();
        if (!snapshot) {
            return;
        }
        this.planStatus = snapshot.planLifecycle;
        this.capability = snapshot.capability ? snapshot.capability.tag : 'Unknown';
        this.registeredCount = (snapshot.registeredKeys || []).length;
        this.storeRevision = snapshot.storeRevision;
        this.storeState = snapshot.storeState;
        var build = snapshot.buildInfo || {};
        this.sdkLabel = build.sdk || 'Host';
        this.buildSha = build.sha || 'host';
        this.timezone = formatOffset(snapshot.utcOffsetMinutes);
        this.hapticsState = snapshot.hapticsState || 'Unknown';
        this.deliveryMode = snapshot.deliveryMode || 'ManualOnly';
        var error = snapshot.lastError;
        this.lastError = error ? (error.code || error.text || 'Unknown') : 'None';
        var lines = [];
        var entries = snapshot.entries || [];
        var count = Math.min(entries.length, 8);
        for (var index = 0; index < count; index += 1) {
            var entry = entries[index];
            var line = entry.tag;
            if (entry.code) {
                line += ' ' + entry.code;
            }
            if (entry.effect) {
                line += ' [' + entry.effect + ']';
            }
            lines.push(line);
        }
        this.entries = lines;
        this.entriesText = lines.join('\n');
        this.hasEntries = this.entriesText.length > 0;
    },
    render() {
        this.syncModel();
    },
    onRefresh() {
        this.syncModel();
    },
    onHome() {
        var app = runtime();
        if (app) {
            app.navigateTo('home');
        }
    }
};
