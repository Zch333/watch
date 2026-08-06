import { createDeviceApp } from './app/device-composition-root.js';
import { createRouterAdapter } from './adapters/ui/router-adapter.js';
import { createFixedClock } from './adapters/memory/fixed-clock.js';
import { createFixedCalendar } from './adapters/memory/fixed-calendar.js';
import { createMemoryStore } from './adapters/memory/memory-store.js';
import { createRecordingReminder } from './adapters/memory/recording-reminder.js';
import { createMemoryHaptics } from './adapters/memory/memory-haptics.js';
import { createMemoryDiagnostics } from './adapters/memory/memory-diagnostics.js';
import { instant } from './domain/values.js';
import { initDeviceApp } from './pages/_app-shell.js';

export default {
    onCreate() {
        console.info('Move25 Application onCreate');

        // Product HAP path: assemble the app from probe-confirmed platform
        // adapters. Until the GT6 capability probes produce platform adapters,
        // the device build runs on the deterministic memory adapters so the
        // emulator can exercise the full Move25 UI; swap these for confirmed
        // platform adapters once probes (delivery/20, 28) succeed.
        const now = instant(Date.now());
        if (now.tag === 'Err') {
            // Defensive: the fixed clock requires a valid Instant.
            return;
        }
        const calendar = createFixedCalendar(480); // UTC+8
        initDeviceApp(createDeviceApp, {
            clock: createFixedClock(now.value),
            calendar: calendar,
            store: createMemoryStore(),
            reminders: createRecordingReminder({ calendar: calendar }),
            haptics: createMemoryHaptics(),
            diagnostics: createMemoryDiagnostics(),
            navigation: createRouterAdapter()
        });
    },
    onDestroy() {
        console.info('Application onDestroy');
    }
};
