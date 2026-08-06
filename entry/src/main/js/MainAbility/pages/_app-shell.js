import { createHostApp } from '../app/composition-root.js';
import { observeCapability } from '../domain/commands.js';
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

function bootApp(instance) {
    const bootResult = instance.boot();
    if (bootResult.tag === 'Err') {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: '快照损坏或无法读取',
                code: bootResult.error.code
            }])
        }));
        return null;
    }
    const booted = bootResult.state;

    // Observe capability through the reminder port (Unknown until a probe confirms).
    const probe = instance.probeCapabilities();
    if (probe.tag === 'Ok') {
        const result = instance.handleCommand(booted, observeCapability(probe.value));
        if (result.tag === 'Ok') {
            state = result.state;
            if (result.facts) {
                model = projectModel(state, result.facts);
            }
            return state;
        }
    }
    state = booted;
    return state;
}

export function initApp(options) {
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

export function dispatch(msg) {
    if (!app || !state) {
        return model;
    }
    const pure = pureUpdate(model, msg);
    model = pure.model;
    const commands = pure.commands || [];
    for (let index = 0; index < commands.length; index += 1) {
        const result = app.handleCommand(state, commands[index]);
        if (result.tag === 'Ok') {
            state = result.state;
            if (result.facts) {
                // A successful command clears stale failure notices; errors
                // survive ordinary page re-renders via refresh().
                model = projectModel(state, result.facts);
            }
        } else {
            const errors = model.errors.concat([{
                text: '操作失败',
                code: result.error && result.error.code
            }]);
            model = Object.freeze(Object.assign({}, model, { errors: errors }));
        }
    }
    return model;
}

export function refresh() {
    if (!app || !state) {
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
    if (reduced.tag === 'Ok' && reduced.value !== state) {
        state = reduced.value;
        const persist = app.ports.store.saveSnapshot(baseRevision, createSnapshot(state));
        if (persist.tag === 'Err') {
            app.ports.diagnostics.append(Object.freeze({
                tag: 'EffectFailed',
                effect: 'PersistSnapshot',
                code: persist.error.code,
                at: clockResult.value
            }));
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
    const status = app.ports.store.readStatus();
    if (status.tag === 'Ok') {
        storeRevision = status.value.revision;
    }

    return {
        capability: state ? state.capability : null,
        registeredKeys: registeredKeys,
        entries: entries,
        storeRevision: storeRevision,
        planLifecycle: state ? state.planLifecycle.tag : 'Unknown'
    };
}
