import { diagnosticsSnapshot, navigateTo } from '../_app-shell.js';

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
        // Lite JS FA binds page instance fields; write this.<field> not this.data.<field>.
        this.planStatus = snapshot.planLifecycle;
        this.capability = snapshot.capability ? snapshot.capability.tag : 'Unknown';
        this.registeredCount = snapshot.registeredKeys.length;
        this.storeRevision = snapshot.storeRevision;
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
        this.entries = lines;
    },
    onRefresh() {
        this.render();
    },
    onHome() {
        navigateTo('home');
    }
};
