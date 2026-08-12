import router from '@system.router';
import { err, ok } from '../../domain/result.js';

const ROUTE_TO_URI = {
    'home': 'pages/home/index',
    'more': 'pages/more/index',
    'break-due': 'pages/break-due/index',
    'break-active': 'pages/break-active/index',
    'settings': 'pages/settings/index',
    'diagnostics': 'pages/diagnostics/index',
    'health-monitoring': 'pages/health-monitoring/index'
};

export function createRouterAdapter() {
    let lastRoute = null;
    let lastNavigationAt = 0;

    return {
        navigate(route) {
            const uri = ROUTE_TO_URI[route];
            if (!uri) {
                return Object.freeze({
                    tag: 'Err',
                    error: Object.freeze({ tag: 'NavigationError', code: 'UNKNOWN_ROUTE', details: route })
                });
            }
            // Start/complete/skip commands carry a Navigate effect for the
            // domain workflow, while the Lite page also performs an explicit
            // fallback navigation after the command returns.  The platform
            // router treats two immediate replaces as a page-destroy race;
            // coalesce only that short duplicate window and allow later user
            // navigations to proceed normally.
            const now = new Date().getTime();
            if (route === lastRoute && now - lastNavigationAt < 100) {
                return ok(Object.freeze({ tag: 'Unit' }));
            }
            // Exception boundary: @system.router.replace is synchronous, but a
            // platform failure must never throw through the effect interpreter.
            // A failed navigation is reported as Err; the caller decides
            // whether the user needs to see it.
            try {
                router.replace({ uri: uri });
                lastRoute = route;
                lastNavigationAt = now;
                return ok(Object.freeze({ tag: 'Unit' }));
            } catch (error) {
                return Object.freeze({
                    tag: 'Err',
                    error: Object.freeze({
                        tag: 'NavigationError',
                        code: 'NAVIGATION_FAILED',
                        details: {
                            route: route,
                            uri: uri,
                            message: error && error.message ? String(error.message) : String(error)
                        }
                    })
                });
            }
        }
    };
}
