import { diagnosticsSnapshot } from '../_app-shell.js';
import router from '@system.router';

export default {
    data: {
        planStatus: 'Unknown',
        capability: 'Unknown',
        registeredCount: 0,
        storeRevision: 0,
        entries: []
    },
    onShow() {
        this.render();
    },
    render() {
        const snapshot = diagnosticsSnapshot();
        if (!snapshot) {
            return;
        }
        this.data.planStatus = snapshot.planLifecycle;
        this.data.capability = snapshot.capability ? snapshot.capability.tag : 'Unknown';
        this.data.registeredCount = snapshot.registeredKeys.length;
        this.data.storeRevision = snapshot.storeRevision;
        const lines = [];
        const entries = snapshot.entries || [];
        for (let index = entries.length - 1; index >= Math.max(0, entries.length - 8); index -= 1) {
            const entry = entries[index];
            let line = entry.tag;
            if (entry.code) {
                line += ' ' + entry.code;
            }
            if (entry.effect) {
                line += ' [' + entry.effect + ']';
            }
            lines.push(line);
        }
        this.data.entries = lines;
    },
    onRefresh() {
        this.render();
    },
    onHome() {
        router.replace({ uri: 'pages/home/index' });
    }
};
