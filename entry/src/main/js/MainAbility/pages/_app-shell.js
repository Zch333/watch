import { createHostApp } from '../app/composition-root.js';
import { observeCapability } from '../domain/commands.js';
import { initialUiModel, projectModel } from './mvu/model.js';
import { update as pureUpdate } from './mvu/update.js';

/**
 * Page-facing shell: owns one host app instance (memory adapters), boots it,
 * probes capabilities and dispatches MVU messages through the pure update +
 * command handler pipeline.
 *
 * This shell runs in the simulator and host tests. The device shell will swap
 * memory adapters for Lite platform adapters once capabilities are confirmed.
 */

let app = null;
let state = null;
let model = initialUiModel();

export function initApp(options) {
    app = createHostApp(options);
    const bootResult = app.boot();
    if (bootResult.tag === 'Err') {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{
                text: '快照损坏或无法读取',
                code: bootResult.error.code
            }])
        }));
        return model;
    }
    state = bootResult.state;

    // Observe capability through the reminder port (Unknown until a probe confirms).
    const probe = app.probeCapabilities();
    if (probe.tag === 'Ok') {
        const result = app.handleCommand(state, observeCapability(probe.value));
        if (result.tag === 'Ok') {
            state = result.state;
            if (result.facts) {
                model = projectModel(state, result.facts);
            }
        }
    }
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
    if (clockResult.tag === 'Ok') {
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
                });
            }
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

export function diagnosticsSnapshot() {
    if (!app) {
        return null;
    }
    const entries = app.ports.diagnostics._all ? app.ports.diagnostics._all() : [];
    const registeredKeys = app.ports.reminders._registeredKeys
        ? app.ports.reminders._registeredKeys()
        : [];
    const peek = app.ports.store._peek ? app.ports.store._peek() : null;
    return {
        capability: state ? state.capability : null,
        registeredKeys: registeredKeys,
        entries: entries,
        storeRevision: peek ? peek.revision : 0,
        planLifecycle: state ? state.planLifecycle.tag : 'Unknown'
    };
}
