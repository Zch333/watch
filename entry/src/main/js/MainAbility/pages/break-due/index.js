import { dispatch, refresh, navigateTo } from '../_app-shell.js';
import { actionLabels, firstErrorText } from '../mvu/labels.js';

export default {
    data: {
        reminderKey: '',
        actions: [],
        hasError: false,
        errorText: ''
    },
    onShow() {
        // Re-entering the page clears the stale notice, like the more page.
        this.hasError = false;
        this.errorText = '';
        this.render();
    },
    render() {
        const model = refresh();
        this.reminderKey = model.dueReminderKey || '';
        this.actions = actionLabels(model.currentGuidance ? model.currentGuidance.actions : []);
    },
    /**
     * A failed start/skip must be visible: the HML error element is bound to
     * hasError/errorText (P2-02). On success the decision's Navigate effect
     * routes to break-active / home.
     */
    afterAction(nextModel) {
        if ((nextModel.errors || []).length === 0) {
            return;
        }
        this.hasError = true;
        this.errorText = firstErrorText(nextModel.errors);
    },
    onStart() {
        this.afterAction(dispatch({ tag: 'StartDuePressed', reminderKey: this.reminderKey }));
    },
    onSkip() {
        this.afterAction(dispatch({ tag: 'SkipBreakPressed' }));
    },
    onHome() {
        navigateTo('home');
    }
};
