import { dispatch, refresh, navigateTo } from '../_app-shell.js';
import { actionLabels } from '../mvu/labels.js';

export default {
    data: {
        reminderKey: '',
        actions: []
    },
    onShow() {
        this.render();
    },
    render() {
        const model = refresh();
        this.reminderKey = model.dueReminderKey || '';
        this.actions = actionLabels(model.currentGuidance ? model.currentGuidance.actions : []);
    },
    onStart() {
        dispatch({ tag: 'StartDuePressed', reminderKey: this.reminderKey });
    },
    onSkip() {
        dispatch({ tag: 'SkipBreakPressed' });
    },
    onHome() {
        navigateTo('home');
    }
};
