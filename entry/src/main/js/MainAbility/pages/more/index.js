import { dispatch, getModel, navigateTo } from '../_app-shell.js';

/**
 * More page: the secondary actions that do not fit the home screen inside
 * the 466px round display. All actions still go through the MVU pipeline
 * (dispatch) and the NavigationPort (navigateTo); nothing here touches the
 * platform router directly.
 */

/**
 * Dispatch a message and leave for home only when the command succeeded
 * end-to-end (including persistence). On failure the page stays put so the
 * user can see the error instead of believing the action took effect (P1-10).
 */
function dispatchThenHome(message) {
    const nextModel = dispatch(message);
    const errors = nextModel.errors || [];
    if (errors.length > 0) {
        return false;
    }
    navigateTo('home');
    return true;
}

export default {
    data: {
        hasError: false,
        errorText: ''
    },
    onShow() {
        // A failed pause/skip keeps the page open with the error visible;
        // re-entering the page clears the stale notice.
        this.hasError = false;
        this.errorText = '';
    },
    onPauseToday() {
        this.runAction({ tag: 'PauseTodayPressed' });
    },
    onPauseHour() {
        this.runAction({ tag: 'PauseOneHourPressed' });
    },
    onSkipNext() {
        this.runAction({ tag: 'SkipNextPressed' });
    },
    onSettings() {
        navigateTo('settings');
    },
    onDiagnostics() {
        navigateTo('diagnostics');
    },
    runAction(message) {
        const ok = dispatchThenHome(message);
        if (!ok) {
            const model = getModel();
            const errors = model.errors || [];
            const last = errors[errors.length - 1];
            this.hasError = true;
            this.errorText = (last && (last.text || last.code)) || '操作失败';
        }
    }
};
