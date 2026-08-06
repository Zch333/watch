import { dispatch, navigateTo } from '../_app-shell.js';

/**
 * More page: the secondary actions that do not fit the home screen inside
 * the 466px round display. All actions still go through the MVU pipeline
 * (dispatch) and the NavigationPort (navigateTo); nothing here touches the
 * platform router directly.
 */
export default {
    onPauseToday() {
        dispatch({ tag: 'PauseTodayPressed' });
        navigateTo('home');
    },
    onPauseHour() {
        dispatch({ tag: 'PauseOneHourPressed' });
        navigateTo('home');
    },
    onSkipNext() {
        dispatch({ tag: 'SkipNextPressed' });
        navigateTo('home');
    },
    onSettings() {
        navigateTo('settings');
    },
    onDiagnostics() {
        navigateTo('diagnostics');
    }
};
