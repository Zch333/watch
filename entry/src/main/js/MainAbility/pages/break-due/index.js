import { dispatch, refresh } from '../_app-shell.js';

export default {
    data: {
        reminderKey: '',
        actions: []
    },
    onShow() {
        const model = refresh();
        this.data.reminderKey = model.dueReminderKey || '';
        this.data.actions = model.currentGuidance ? model.currentGuidance.actions : [];
    },
    onStart() {
        dispatch({ tag: 'StartDuePressed', reminderKey: this.data.reminderKey });
    },
    onSkip() {
        dispatch({ tag: 'SkipBreakPressed' });
    }
};
