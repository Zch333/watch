import { dispatch, refresh, navigateTo } from '../_app-shell.js';
import { actionLabels } from '../mvu/labels.js';

function formatSeconds(seconds) {
    const safe = typeof seconds === 'number' && seconds >= 0 ? seconds : 0;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export default {
    data: {
        remainingText: '05:00',
        actions: []
    },
    timerId: -1,
    elapsedDispatched: false,

    onShow() {
        this.render();
        this.startVisibleTicker();
    },
    onHide() {
        this.stopVisibleTicker();
    },
    onDestroy() {
        this.stopVisibleTicker();
    },

    render() {
        const model = refresh();
        // Lite JS FA binds page instance fields; write this.<field> not this.data.<field>.
        this.remainingText = formatSeconds(model.remainingSeconds);
        this.actions = actionLabels(model.currentGuidance ? model.currentGuidance.actions : []);
    },

    /**
     * Visible-only countdown ticker. Correctness never depends on this timer:
     * every tick recomputes the remaining time from the absolute endsAt, and
     * the timer is stopped as soon as the page hides. Long-term background
     * correctness is owned by system reminders + startup reconciliation, so
     * this is a display ticker, never a background timer.
     */
    startVisibleTicker() {
        this.stopVisibleTicker();
        const self = this;
        this.timerId = setInterval(function () {
            const model = refresh();
            self.remainingText = formatSeconds(model.remainingSeconds);
            if (model.remainingSeconds === 0 && !self.elapsedDispatched) {
                self.elapsedDispatched = true;
                dispatch({ tag: 'BreakElapsed' });
                self.stopVisibleTicker();
                navigateTo('home');
            }
        }, 1000);
    },
    stopVisibleTicker() {
        if (this.timerId >= 0) {
            clearInterval(this.timerId);
            this.timerId = -1;
        }
    },

    onComplete() {
        this.stopVisibleTicker();
        dispatch({ tag: 'CompletePressed' });
    },
    onSkip() {
        this.stopVisibleTicker();
        dispatch({ tag: 'SkipBreakPressed' });
    }
};
