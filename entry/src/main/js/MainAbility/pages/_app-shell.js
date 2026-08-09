import { createHostApp } from '../app/composition-root.js';
import { observeCapability, reconcilePlan } from '../domain/commands.js';
import { createSnapshot } from '../domain/snapshot.js';
import { reduceTemporalState } from '../domain/evolve.js';
import { REMINDER_NAMESPACE } from '../app/command-handler.js';
import { initialUiModel, projectModel } from './mvu/model.js';
import { update as pureUpdate } from './mvu/update.js';

/**
 * Page-facing shell: owns one app instance, boots it, probes capabilities and
 * dispatches MVU messages through the pure update + command handler pipeline.
 *
 * Two composition roots:
 *  - createHostApp (memory adapters): host tests + simulator baseline;
 *  - createDeviceApp (platform adapters): the product HAP. Until capability
 *    probes confirm adapters, the device path surfaces an explicit error
 *    model instead of silently running on fake adapters.
 */

let app = null;
let state = null;
let model = initialUiModel();
let bootComplete = false;
let pendingCommand = false;
let pendingTemporalPersist = false;

function appendModelError(text, code) {
    model = Object.freeze(Object.assign({}, model, {
        errors: Object.freeze(model.errors.concat([{
            text: text,
            code: code
        }]))
    }));
}

function resetShell() {
    app = null;
    state = null;
    model = initialUiModel();
    bootComplete = false;
    pendingCommand = false;
    pendingTemporalPersist = false;
}

function executeCommand(instance, baseState, command, done) {
    let settled = false;
    let settledResult = null;
    const finish = function (result) {
        if (settled) {
            return;
        }
        settled = true;
        settledResult = result;
        done(result);
    };
    try {
        if (typeof instance.handleCommandAsync === 'function') {
            const immediate = instance.handleCommandAsync(
                baseState,
                command,
                undefined,
                finish
            );
            if (immediate && immediate.tag !== 'Pending') {
                finish(immediate);
            }
            // Memory/test adapters may invoke their callback synchronously.
            // In that case do not report Pending after completion and put the
            // UI back into a busy state.
            return settled ? settledResult : immediate;
        }
        const result = instance.handleCommand(baseState, command);
        finish(result);
        return result;
    } catch (error) {
        const result = {
            tag: 'Err',
            error: {
                code: 'COMMAND_FAILED',
                details: error && error.message ? error.message : String(error)
            },
            state: baseState
        };
        finish(result);
        return result;
    }
}

function bootApp(instance) {
    bootComplete = false;
    pendingCommand = false;
    pendingTemporalPersist = false;
    const bootResult = instance.boot();
    if (bootResult.tag === 'Err') {
        const unavailable = bootResult.error && (
            bootResult.error.code === 'STORAGE_UNAVAILABLE' ||
            bootResult.error.code === 'STORAGE_TIMEOUT'
        );
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: unavailable
                    ? '本地存储暂不可用，无法恢复设置'
                    : '快照损坏或无法读取',
                code: bootResult.error.code
            }])
        }));
        return null;
    }
    const booted = bootResult.state;
    // The booted state is the committed (persisted) state.
    state = booted;
    // Errors recorded during THIS boot only: a fresh boot must not carry
    // failures from an earlier boot over into the new projection.
    const bootErrors = [];

    // Observe capability through the reminder port (Unknown until a probe confirms).
    const finishReconcile = function (reconciled) {
        if (reconciled.tag === 'Ok') {
            state = reconciled.state;
            bootComplete = true;
            model = projectModel(state, reconciled.facts, bootErrors);
            return;
        }
        bootErrors.push({
            text: '启动对账失败',
            code: reconciled.error && reconciled.error.code
        });
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze(bootErrors)
        }));
    };

    const startReconcile = function () {
        // Startup reconciliation: every launch converges the system reminder
        // registry with the persisted plan and the domain's desired plan.
        executeCommand(instance, state, reconcilePlan(), finishReconcile);
    };

    const probe = instance.probeCapabilities();
    if (probe.tag === 'Ok') {
        executeCommand(instance, booted, observeCapability(probe.value), function (result) {
            if (result.tag === 'Ok') {
                state = result.state;
            } else {
                bootErrors.push({
                    text: '能力状态保存失败',
                    code: result.error && result.error.code
                });
            }
            startReconcile();
        });
    } else {
        // Probe failure must be visible, but it must not block reading the
        // persisted state or reconciling the registry.
        bootErrors.push({
            text: '提醒能力探测失败',
            code: probe.error && probe.error.code
        });
        startReconcile();
    }
    return state;
}

export function initApp(options) {
    // A failed re-initialization must never leave the previous app/state
    // reachable through isReady().
    resetShell();
    let instance;
    try {
        instance = createHostApp(options);
    } catch (error) {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: '宿主装配失败：' + (error && error.message ? error.message : String(error)),
                code: 'HOST_COMPOSITION_FAILED'
            }])
        }));
        return model;
    }
    app = instance;
    bootApp(instance);
    return model;
}

/**
 * Product HAP entry: assemble the device app through the injected factory
 * (createDeviceApp with probe-confirmed adapters). When adapters are not yet
 * confirmed the factory throws and the shell reports an explicit error model
 * (no crash, no silent fake adapters).
 */
export function initDeviceApp(factory, adapters) {
    // Clear a previous successful runtime before validating the new device
    // composition. Otherwise a failed restart could expose stale state.
    resetShell();
    if (typeof factory !== 'function') {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: '设备装配工厂缺失',
                code: 'DEVICE_FACTORY_MISSING'
            }])
        }));
        return model;
    }
    let instance;
    try {
        instance = factory(adapters);
    } catch (error) {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: '平台适配器未就绪（能力探针待执行）：' +
                    (error && error.message ? error.message : String(error)),
                code: 'ADAPTERS_NOT_CONFIRMED'
            }])
        }));
        return model;
    }
    app = instance;
    bootApp(instance);
    return model;
}

export function dispatch(msg, done) {
    const complete = function (result) {
        if (typeof done === 'function') {
            done(model, result);
        }
    };
    if (!app || !state || !bootComplete) {
        complete({
            tag: 'Err',
            error: { code: 'APP_NOT_READY' },
            state: state
        });
        return model;
    }
    if (pendingCommand) {
        complete({
            tag: 'Err',
            error: { code: 'COMMAND_PENDING' },
            state: state
        });
        return model;
    }
    const pure = pureUpdate(model, msg);
    model = pure.model;
    const commands = pure.commands || [];
    let lastResult = { tag: 'Ok', state: state };
    const run = function (index) {
        if (index >= commands.length) {
            complete(lastResult);
            return;
        }
        pendingCommand = true;
        const baseState = state;
        const finish = function (result) {
            pendingCommand = false;
            lastResult = result;
            model = Object.freeze(Object.assign({}, model, {
                commandPending: false,
                isBusy: false
            }));
            if (result.tag === 'Ok') {
                state = result.state;
                if (result.facts) {
                    // A successful command clears stale failure notices; errors
                    // survive ordinary page re-renders via refresh().
                    model = projectModel(state, result.facts);
                }
            } else {
                appendModelError('操作失败', result.error && result.error.code);
            }
            run(index + 1);
        };
        const result = executeCommand(app, baseState, commands[index], finish);
        if (result && result.tag === 'Pending') {
            model = Object.freeze(Object.assign({}, model, {
                commandPending: true,
                isBusy: true
            }));
        }
    };
    run(0);
    return model;
}

export function refresh() {
    if (!app || !state || !bootComplete) {
        return model;
    }
    const clockResult = app.ports.clock.now();
    if (clockResult.tag === 'Err') {
        return model;
    }

    // Temporal reduction on page visibility: an expired break session or
    // pause is settled now instead of waiting for the next command. Pure
    // reduction; the snapshot is persisted only when something changed.
    // The store is optimistic-concurrency: pass the pre-reduction revision
    // (the last persisted one), exactly like the command handler does.
    const baseRevision = state.revision;
    const reduced = reduceTemporalState(state, clockResult.value);
    if (reduced.tag === 'Ok' && reduced.value !== state && !pendingTemporalPersist) {
        const candidateState = reduced.value;
        const snapshot = createSnapshot(candidateState);
        let persistSettled = false;
        const onPersist = function (persist) {
            if (persistSettled) {
                return;
            }
            persistSettled = true;
            pendingTemporalPersist = false;
            if (persist.tag === 'Ok') {
                // Only a persisted reduction may become the global state: a
                // failed save must not leave an uncommitted revision in memory
                // (that would make every later save collide forever).
                state = candidateState;
                return;
            }
            app.ports.diagnostics.append(Object.freeze({
                tag: 'EffectFailed',
                effect: 'PersistSnapshot',
                code: persist.error.code,
                at: clockResult.value
            }));
            appendModelError('状态保存失败，请重新打开应用', persist.error.code);
        };
        if (typeof app.ports.store.saveSnapshotAsync === 'function') {
            pendingTemporalPersist = true;
            try {
                const pending = app.ports.store.saveSnapshotAsync(
                    baseRevision,
                    snapshot,
                    onPersist
                );
                if (pending && pending.tag === 'Err') {
                    onPersist(pending);
                }
            } catch (error) {
                onPersist({
                    tag: 'Err',
                    error: {
                        code: 'IO_FAILURE',
                        details: error && error.message ? error.message : String(error)
                    }
                });
            }
        } else {
            onPersist(app.ports.store.saveSnapshot(baseRevision, snapshot));
        }
    }

    const offset = app.ports.calendar.utcOffset(clockResult.value);
    if (offset.tag === 'Ok') {
        const wall = app.ports.calendar.localWall(clockResult.value, offset.value);
        if (wall.tag === 'Ok') {
            model = projectModel(state, {
                now: clockResult.value,
                localWall: wall.value,
                utcOffsetMinutes: offset.value,
                registeredPlan: [],
                horizonDays: 3
            }, model.errors);
        }
    }
    return model;
}

export function getModel() {
    return model;
}

export function getState() {
    return state;
}

export function isReady() {
    return !!(app && state && bootComplete);
}

/**
 * Page navigation through the NavigationPort. Pages must never import the
 * platform router directly; the port is wired to the platform adapter by the
 * composition root (device) or the recording adapter (host).
 */
export function navigateTo(route) {
    if (!app || !app.ports || !app.ports.navigation) {
        return Object.freeze({
            tag: 'Err',
            error: Object.freeze({ tag: 'NavigationError', code: 'NAVIGATION_UNAVAILABLE', details: route })
        });
    }
    return app.ports.navigation.navigate(route);
}

export function diagnosticsSnapshot() {
    if (!app) {
        return null;
    }
    // Formal port queries only: the diagnostics view must never depend on
    // adapter privates. A failing query degrades to empty values instead of
    // crashing the read-only page.
    let entries = [];
    const recent = app.ports.diagnostics.readRecent(12);
    if (recent.tag === 'Ok') {
        entries = recent.value;
    }

    let registeredKeys = [];
    const listed = app.ports.reminders.listRegistered(REMINDER_NAMESPACE);
    if (listed.tag === 'Ok') {
        registeredKeys = (listed.value || []).map(function (intent) {
            return intent && intent.key ? intent.key.value : null;
        }).filter(function (key) {
            return typeof key === 'string';
        });
    }

    let storeRevision = 0;
    let storeState = 'Unknown';
    const status = app.ports.store.readStatus();
    if (status.tag === 'Ok') {
        storeRevision = status.value.revision;
        storeState = status.value.persistenceState || 'Memory';
    }

    let utcOffsetMinutes = null;
    const now = app.ports.clock.now();
    if (now.tag === 'Ok') {
        const offset = app.ports.calendar.utcOffset(now.value);
        if (offset.tag === 'Ok') {
            utcOffsetMinutes = offset.value;
        }
    }
    const capabilityTag = state && state.capability ? state.capability.tag : 'Unknown';
    let deliveryMode = 'ManualOnly';
    if (capabilityTag === 'Supported') {
        deliveryMode = 'WatchStandalone';
    } else if (capabilityTag === 'Degraded') {
        deliveryMode = 'WatchDegraded';
    }
    const lastError = model.errors.length > 0
        ? model.errors[model.errors.length - 1]
        : null;

    return {
        capability: state ? state.capability : null,
        registeredKeys: registeredKeys,
        entries: entries,
        storeRevision: storeRevision,
        storeState: storeState,
        planLifecycle: state ? state.planLifecycle.tag : 'Unknown',
        utcOffsetMinutes: utcOffsetMinutes,
        hapticsState: app.ports.haptics && typeof app.ports.haptics.vibrate === 'function'
            ? 'WiredUnverified'
            : 'Unavailable',
        deliveryMode: deliveryMode,
        lastError: lastError
    };
}

// Host-side page tests load the same page modules without a Lite ViewModel,
// so there is no platform getApp() function.  Expose a tiny compatibility
// facade only when a global object exists; deployed pages prefer the real
// application object returned by getApp().  This keeps the deploy source free
// of local imports while preserving deterministic host coverage.
const globalObject = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof global !== 'undefined' ? global : null);
if (globalObject) {
    globalObject.__MOVE25_HOST_RUNTIME__ = {
        isReady: isReady,
        getModel: getModel,
        getState: getState,
        refresh: refresh,
        dispatch: dispatch,
        navigateTo: navigateTo,
        diagnosticsSnapshot: diagnosticsSnapshot,
        start: function () {}
    };
}
