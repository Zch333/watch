import {
    acknowledgeBreakFinished,
    completeBreak,
    configureSchedule,
    disablePlan,
    enablePlan,
    pauseForOneHour,
    pauseForToday,
    reconcilePlan,
    skipBreak,
    skipNext,
    startBreak,
    startBreakNow
} from '../../domain/commands.js';

/**
 * MVU update: UiModel + Msg -> { model, commands }.
 * Pure: no ports, no clock (time arrives in messages), no storage.
 */

function withModel(model, patch) {
    return Object.freeze(Object.assign({}, model, patch));
}

export function update(model, msg) {
    if (!msg || typeof msg.tag !== 'string') {
        return { model: model, commands: [] };
    }

    switch (msg.tag) {
        case 'AppOpened':
            return {
                model: withModel(model, { isBusy: true }),
                commands: msg.now ? [reconcilePlan(msg.now)] : []
            };

        case 'EnablePressed':
            return { model: model, commands: [enablePlan()] };

        case 'DisablePressed':
            return { model: model, commands: [disablePlan()] };

        case 'PauseTodayPressed':
            return { model: model, commands: [pauseForToday()] };

        case 'PauseOneHourPressed':
            return { model: model, commands: [pauseForOneHour()] };

        case 'SkipNextPressed':
            return { model: model, commands: [skipNext()] };

        case 'SkipBreakPressed':
            return { model: model, commands: [skipBreak()] };

        case 'StartNowPressed':
            return { model: model, commands: [startBreakNow()] };

        case 'StartDuePressed':
            return {
                model: model,
                commands: msg.reminderKey ? [startBreak(msg.reminderKey)] : [startBreakNow()]
            };

        case 'CompletePressed':
            return { model: model, commands: [completeBreak()] };

        case 'AckFinishedPressed':
            return { model: model, commands: [acknowledgeBreakFinished()] };

        case 'SettingsSaved':
            return {
                model: model,
                commands: msg.raw ? [configureSchedule(msg.raw)] : []
            };

        case 'ReconcilePressed':
            return {
                model: model,
                commands: msg.now ? [reconcilePlan(msg.now)] : []
            };

        case 'BreakElapsed': {
            // Visible countdown reached zero: let the shell reduce the expired
            // Active session (absolute time) instead of trusting this page.
            return { model: model, commands: [reconcilePlan()] };
        }

        case 'TickVisible': {
            // Visible-only countdown: recompute from the absolute endsAt.
            const remaining = model.endsAtEpochMs > 0 && typeof msg.now === 'number'
                ? Math.max(0, Math.floor((model.endsAtEpochMs - msg.now) / 1000))
                : model.remainingSeconds;
            return { model: withModel(model, { remainingSeconds: remaining }), commands: [] };
        }

        default:
            return { model: model, commands: [] };
    }
}
