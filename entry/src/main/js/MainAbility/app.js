import { createDeviceApp } from './app/device-composition-root.js';
import { createRouterAdapter } from './adapters/ui/router-adapter.js';
import { initDeviceApp } from './pages/_app-shell.js';

export default {
    onCreate() {
        console.info('Move25 Application onCreate');

        // Product HAP path: assemble the app from probe-confirmed platform
        // adapters. Until the GT6 capability probes produce adapters, the
        // shell surfaces an explicit "adapters not confirmed" state instead
        // of silently running on fake/memory adapters or crashing.
        //
        // When probes confirm adapters, pass them here, e.g.:
        //   initDeviceApp(createDeviceApp, {
        //       clock: createLiteClock(),
        //       calendar: createLiteCalendar(),
        //       store: createLiteStore(),
        //       reminders: createLiteReminder(),
        //       haptics: createLiteHaptics(),
        //       diagnostics: createLiteDiagnostics(),
        //       navigation: createRouterAdapter()
        //   });
        initDeviceApp(createDeviceApp, {
            navigation: createRouterAdapter()
        });
    },
    onDestroy() {
        console.info('Application onDestroy');
    }
};
