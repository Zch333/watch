import { dispatch, refresh, navigateTo } from '../_app-shell.js';
import { actionLabels, firstErrorText } from '../mvu/labels.js';

function formatSeconds(seconds) {
    const safe = typeof seconds === 'number' && seconds >= 0 ? seconds : 0;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export default {
    data: {
        remainingText: '05:00',
        actions: [],
        finished: false,
        hasError: false,
        errorText: ''
    },
    timerId: -1,
    elapsedDispatched: false,

    onShow() {
        // Lite page instances may be reused: every new visible session must
        // be allowed to dispatch its own expiry event. Without the reset, a
        // second break would never send BreakElapsed (P1-08).
        this.elapsedDispatched = false;
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
        this.finished = model.breakStatus === 'Finished';
    },

    /**
     * Visible-only countdown ticker. Correctness never depends on this timer:
     * every tick recomputes the remaining time from the absolute endsAt, and
     * the timer is stopped as soon as the page hides. Long-term background
     * correctness is owned by system reminders + startup reconciliation, so
     * this is a display ticker, never a background timer.
     *
     * Expiry closes the loop deterministically (P1-03): the shell's refresh()
     * may already have reduced Active -> Finished and persisted, so the page
     * dispatches BreakElapsed once — the command handler is the single
     * reducer and an Ok result is the signal to navigate home. Only a failed
     * dispatch keeps the page open, with the error visible (P2-02).
     */
    startVisibleTicker() {
        this.stopVisibleTicker();
        const self = this;
        this.timerId = setInterval(function () {
            const model = refresh();
            self.remainingText = formatSeconds(model.remainingSeconds);
            self.finished = model.breakStatus === 'Finished';
            if (self.elapsedDispatched) {
                return;
            }
            const expired = model.breakStatus !== 'Active' || model.remainingSeconds === 0;
            if (!expired) {
                return;
            }
            self.elapsedDispatched = true;
            self.stopVisibleTicker();
            const nextModel = dispatch({ tag: 'BreakElapsed' });
            if ((nextModel.errors || []).length === 0) {
                navigateTo('home');
                return;
            }
            self.hasError = true;
            self.errorText = firstErrorText(nextModel.errors);
            self.render();
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
        this.afterAction(dispatch({ tag: 'CompletePressed' }));
    },
    onSkip() {
        this.stopVisibleTicker();
        this.afterAction(dispatch({ tag: 'SkipBreakPressed' }));
    },
    /**
     * A failed action must be visible: the HML error element is bound to
     * hasError/errorText and render() re-projects the model, so a failed
     * complete/skip no longer looks like a dead button (P2-02). On success
     * the decision's Navigate effect already routes home.
     */
    afterAction(nextModel) {
        if ((nextModel.errors || []).length === 0) {
            return;
        }
        this.hasError = true;
        this.errorText = firstErrorText(nextModel.errors);
        this.render();
    },
    /**
     * Explicit exit from a Finished session: acknowledging it confirms the
     * finished outcome and returns the session to NoBreak. A following
     * valid callback then opens a fresh Due prompt instead of overwriting
     * the Finished session directly.
     */
    onHome() {
        this.stopVisibleTicker();
        if (this.finished) {
            dispatch({ tag: 'AckFinishedPressed' });
        }
        navigateTo('home');
    }
};
