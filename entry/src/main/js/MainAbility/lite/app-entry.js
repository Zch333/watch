import { createDeviceApp } from '../app/device-composition-root.js';
import { createRouterAdapter } from '../adapters/ui/router-adapter.js';
import { createSystemClock } from '../adapters/device/system-clock.js';
import { createSystemCalendar } from '../adapters/device/system-calendar.js';
import { createSystemHaptics } from '../adapters/device/system-haptics.js';
import { createUnsupportedReminder } from '../adapters/device/unsupported-reminder.js';
import { openSystemStore } from '../adapters/device/system-store.js';
import { createMemoryDiagnostics } from '../adapters/memory/memory-diagnostics.js';
import {
    dispatch as shellDispatch,
    diagnosticsSnapshot as shellDiagnosticsSnapshot,
    getModel as shellGetModel,
    getState as shellGetState,
    initDeviceApp,
    isReady as shellIsReady,
    navigateTo as shellNavigateTo,
    refresh as shellRefresh
} from '../pages/_app-shell.js';

/*
 * The Lite loader can compile page modules, but its generated app wrapper
 * contains a Node-style require() which is not available in the wearable
 * runtime.  This file is bundled by tools/lite-bundle.cjs into a plain
 * CommonJS app object.  Keeping the real composition root here means the
 * generated artifact still uses the same domain, ports and adapters as the
 * host tests; only the loader boundary is different.
 */
let started = false;
let ready = false;
let startError = null;
const buildInfo = Object.freeze({
    sdk: typeof __MOVE25_SDK_LABEL__ !== 'undefined' ? __MOVE25_SDK_LABEL__ : 'Lite API 24',
    sha: typeof __MOVE25_BUILD_SHA__ !== 'undefined' ? __MOVE25_BUILD_SHA__ : 'unknown',
    version: typeof __MOVE25_APP_VERSION__ !== 'undefined' ? __MOVE25_APP_VERSION__ : 'unknown'
});

function start() {
    if (started) {
        return;
    }
    started = true;
    try {
        openSystemStore(function (store) {
            try {
                initDeviceApp(createDeviceApp, {
                    clock: createSystemClock(),
                    calendar: createSystemCalendar(),
                    store: store,
                    reminders: createUnsupportedReminder(),
                    haptics: createSystemHaptics(),
                    diagnostics: createMemoryDiagnostics(),
                    navigation: createRouterAdapter()
                });
                ready = shellIsReady();
                if (!ready) {
                    startError = '应用状态初始化失败';
                }
            } catch (error) {
                startError = error && error.message ? String(error.message) : String(error);
            }
        });
    } catch (error) {
        startError = error && error.message ? String(error.message) : String(error);
    }
}

const app = {
    onCreate() {
        console.info('Move25 Application onCreate');
        start();
    },
    onDestroy() {
        console.info('Move25 Application onDestroy');
    },
    start: start,
    isReady() {
        // Boot may finish its final durable commits asynchronously after
        // initDeviceApp returns. Read the shell's live readiness rather than
        // caching the first (usually false) value here.
        return shellIsReady();
    },
    startError() {
        return startError;
    },
    getModel() {
        return shellGetModel();
    },
    getState() {
        return shellGetState();
    },
    refresh() {
        return shellRefresh();
    },
    dispatch(message, done) {
        return shellDispatch(message, done);
    },
    navigateTo(route) {
        return shellNavigateTo(route);
    },
    diagnosticsSnapshot() {
        const snapshot = shellDiagnosticsSnapshot();
        return snapshot
            ? Object.freeze(Object.assign({}, snapshot, { buildInfo: buildInfo }))
            : null;
    }
};

// Some Lite previewer builds do not expose the Stage-style getApp() helper to
// page scripts.  Publish the same facade explicitly so every page still
// reaches the real device composition root rather than the host-test shim.
const globalObject = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof global !== 'undefined' ? global : null);
if (globalObject) {
    globalObject.__MOVE25_LITE_RUNTIME__ = app;
}

export default app;
