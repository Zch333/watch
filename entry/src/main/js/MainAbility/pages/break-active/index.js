import { dispatch, refresh } from '../_app-shell.js';

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
    onShow() {
        this.render();
    },
    render() {
        const model = refresh();
        this.data.remainingText = formatSeconds(model.remainingSeconds);
        this.data.actions = model.currentGuidance ? model.currentGuidance.actions : [];
    },
    onComplete() {
        dispatch({ tag: 'CompletePressed' });
    },
    onSkip() {
        dispatch({ tag: 'SkipBreakPressed' });
    }
};
