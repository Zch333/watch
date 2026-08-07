import { buildDesiredPlanForState } from '../../domain/decide.js';
import { guidanceAt, guidanceCount } from '../../domain/guidance.js';

/**
 * MVU model projection: domain state + facts -> UiModel.
 * Pure. UI copy lives here only as display strings, never as domain state.
 */

function formatMinute(minuteValue) {
    const hours = Math.floor(minuteValue / 60);
    const minutes = minuteValue % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
}

export function initialUiModel() {
    return Object.freeze({
        tag: 'UiModel',
        planStatus: 'Unknown',
        nextBreakText: '—',
        remainingSeconds: 0,
        endsAtEpochMs: 0,
        capabilityBanner: Object.freeze({ level: 'warn', text: '提醒能力未确认' }),
        canSchedule: false,
        currentGuidance: null,
        breakStatus: 'NoBreak',
        breakOutcome: null,
        settingsSummary: Object.freeze({
            weekdays: [],
            blocks: [],
            rawBlocks: [],
            focusMinutes: 25,
            breakMinutes: 5
        }),
        errors: Object.freeze([]),
        isBusy: false
    });
}

function capabilityBannerFor(capability) {
    if (!capability) {
        return Object.freeze({ level: 'warn', text: '提醒能力未确认' });
    }
    switch (capability.tag) {
        case 'Supported':
            return Object.freeze({ level: 'ok', text: '提醒能力已确认' });
        case 'Unknown':
            return Object.freeze({ level: 'warn', text: '提醒能力未确认' });
        case 'Unsupported':
            return Object.freeze({ level: 'error', text: '此设备不支持后台提醒' });
        case 'RequiresApproval':
            return Object.freeze({ level: 'error', text: '提醒能力需要授权' });
        case 'Degraded':
            return Object.freeze({ level: 'warn', text: '后台提醒可靠性受限' });
        default:
            return Object.freeze({ level: 'warn', text: '提醒能力未知' });
    }
}

function guidanceFor(session, guidanceIndex) {
    if (!session) {
        return null;
    }
    if (session.tag === 'Active') {
        for (let index = 0; index < guidanceCount(); index += 1) {
            const item = guidanceAt(index);
            if (item.id === session.guidanceId) {
                return Object.freeze({ id: item.id, actions: item.actions });
            }
        }
        return null;
    }
    if (session.tag === 'Due') {
        // The Due prompt must show exactly what starting the break will run:
        // startActiveBreak selects guidanceAt(state.guidanceIndex). Projecting
        // guidanceAt(0) here would show one suggestion and run another.
        const item = guidanceAt(guidanceIndex);
        return Object.freeze({ id: item.id, actions: item.actions });
    }
    return null;
}

function settingsSummaryFor(settings) {
    const weekdays = [];
    const blocks = [];
    const rawBlocks = [];
    if (settings) {
        const names = settings.weekdays || [];
        for (let index = 0; index < names.length; index += 1) {
            weekdays.push(names[index].value);
        }
        const list = settings.workBlocks || [];
        for (let index = 0; index < list.length; index += 1) {
            blocks.push(formatMinute(list[index].start.value) + '–' +
                formatMinute(list[index].end.value));
            rawBlocks.push(Object.freeze({
                start: list[index].start.value,
                end: list[index].end.value
            }));
        }
    }
    return Object.freeze({
        weekdays: Object.freeze(weekdays),
        blocks: Object.freeze(blocks),
        rawBlocks: Object.freeze(rawBlocks),
        focusMinutes: settings && settings.rhythm ? settings.rhythm.focusMinutes.value : 25,
        breakMinutes: settings && settings.rhythm ? settings.rhythm.breakMinutes.value : 5
    });
}

/**
 * Project domain state into the view model using explicit facts.
 *
 * `errors` is a carried-in parameter, not something the projection owns:
 * shell-recorded failures (a failed command, a boot error) must survive
 * re-renders. The shell passes the current model's errors on refresh and
 * lets them clear after the next successful command. The function stays
 * pure: same (state, facts, errors) always projects identically.
 */
export function projectModel(state, facts, errors) {
    let nextBreakText = '—';
    if (facts && facts.localWall) {
        const desired = buildDesiredPlanForState(state, facts);
        if (desired.tag === 'Ok' && desired.value.length > 0) {
            nextBreakText = formatMinute(desired.value[0].at.value);
        }
    }

    let remainingSeconds = 0;
    let endsAtEpochMs = 0;
    const session = state.breakSession;
    if (session && session.tag === 'Active' && facts && facts.now) {
        endsAtEpochMs = session.endsAt.epochMilliseconds;
        remainingSeconds = Math.max(0, Math.floor((endsAtEpochMs - facts.now.epochMilliseconds) / 1000));
    }

    let breakOutcome = null;
    let dueReminderKey = null;
    if (session && session.tag === 'Finished' && session.outcome) {
        breakOutcome = session.outcome.tag;
    }
    if (session && session.tag === 'Due' && session.reminderKey) {
        dueReminderKey = session.reminderKey.value || session.reminderKey;
    }

    return Object.freeze({
        tag: 'UiModel',
        planStatus: state.planLifecycle ? state.planLifecycle.tag : 'Unknown',
        nextBreakText: nextBreakText,
        remainingSeconds: remainingSeconds,
        endsAtEpochMs: endsAtEpochMs,
        capabilityBanner: capabilityBannerFor(state.capability),
        canSchedule: !!(state.capability && state.capability.tag === 'Supported'),
        currentGuidance: guidanceFor(session, state.guidanceIndex),
        breakStatus: session ? session.tag : 'NoBreak',
        breakOutcome: breakOutcome,
        dueReminderKey: dueReminderKey,
        settingsSummary: settingsSummaryFor(state.settings),
        errors: Object.freeze((errors || []).slice()),
        isBusy: false
    });
}
