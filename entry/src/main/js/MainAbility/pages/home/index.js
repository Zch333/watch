import { dispatch, refresh, navigateTo } from '../_app-shell.js';

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

/**
 * Home keeps only the primary actions that fit the 466px round screen:
 * start now, toggle, and the More page. Pause/skip/settings/diagnostics
 * live on pages/more (scrollable list).
 */
const BANNER_COLORS = {
    ok: '#7cd07c',
    warn: '#ffcc00',
    error: '#ff6b6b'
};

export default {
    data: {
        capabilityText: '提醒能力未确认',
        bannerColor: '#ffcc00',
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
        // Lite JS FA binds page instance fields (declared in `data`), so the
        // template is updated by writing `this.<field>`, not `this.data.<field>`.
        this.capabilityText = model.capabilityBanner.text;
        this.bannerColor = BANNER_COLORS[model.capabilityBanner.level] || BANNER_COLORS.warn;
        this.planStatusText = statusText(model.planStatus);
        this.nextBreak = model.nextBreakText;
        const errors = model.errors || [];
        this.hasError = errors.length > 0;
        this.errorText = errors.length > 0 ? (errors[0].text || errors[0].code || '') : '';
    },
    onStartNow() {
        dispatch({ tag: 'StartNowPressed' });
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
    onMore() {
        navigateTo('more');
    }
};
