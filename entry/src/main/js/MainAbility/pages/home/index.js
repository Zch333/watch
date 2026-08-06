import { dispatch, refresh } from '../_app-shell.js';
import router from '@system.router';

function statusText(tag) {
    const map = {
        Disabled: '已关闭',
        Enabling: '启用中',
        Enabled: '已启用',
        Paused: '已暂停',
        Blocked: '能力受阻',
        Unknown: '未知'
    };
    return map[tag] || tag;
}

export default {
    data: {
        capabilityText: '提醒能力未确认',
        capabilityLevel: 'warn',
        planStatusText: '未知',
        nextBreak: '—',
        hasError: false,
        errorText: ''
    },
    onShow() {
        this.render();
    },
    render() {
        const model = refresh();
        this.data.capabilityText = model.capabilityBanner.text;
        this.data.capabilityLevel = model.capabilityBanner.level;
        this.data.planStatusText = statusText(model.planStatus);
        this.data.nextBreak = model.nextBreakText;
        const errors = model.errors || [];
        this.data.hasError = errors.length > 0;
        this.data.errorText = errors.length > 0 ? (errors[0].text || errors[0].code || '') : '';
    },
    onStartNow() {
        dispatch({ tag: 'StartNowPressed' });
        this.render();
    },
    onPauseToday() {
        dispatch({ tag: 'PauseTodayPressed' });
        this.render();
    },
    onPauseHour() {
        dispatch({ tag: 'PauseOneHourPressed' });
        this.render();
    },
    onSkipNext() {
        dispatch({ tag: 'SkipNextPressed' });
        this.render();
    },
    onToggle() {
        const model = refresh();
        if (model.planStatus === 'Enabled' || model.planStatus === 'Paused') {
            dispatch({ tag: 'DisablePressed' });
        } else {
            dispatch({ tag: 'EnablePressed' });
        }
        this.render();
    },
    onSettings() {
        router.replace({ uri: 'pages/settings/index' });
    },
    onDiagnostics() {
        router.replace({ uri: 'pages/diagnostics/index' });
    }
};
