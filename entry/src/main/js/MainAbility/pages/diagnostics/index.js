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

export default {
    data: {
        planStatus: 'Unknown',
        capability: 'Unknown',
        registeredCount: 0,
        storeRevision: 0,
        storeState: 'Unknown',
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
