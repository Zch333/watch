/**
 * Router adapter: Lite JS page navigation through the platform router.
 *
 * Evidence: INFERRED — @system.router is the standard Lite JS navigation API
 * (see Lite SDK reference); must be re-confirmed in the DevEco simulator.
 * The domain only requests routes as Navigate effects; this adapter translates
 * route names to page paths.
 */
import router from '@system.router';
import { ok } from '../../domain/result.js';

const ROUTE_TO_URI = {
    'home': 'pages/home/index',
    'more': 'pages/more/index',
    'break-due': 'pages/break-due/index',
    'break-active': 'pages/break-active/index',
    'settings': 'pages/settings/index',
    'diagnostics': 'pages/diagnostics/index'
};

export function createRouterAdapter() {
    return {
        navigate(route) {
            const uri = ROUTE_TO_URI[route];
            if (!uri) {
                return Object.freeze({
                    tag: 'Err',
                    error: Object.freeze({ tag: 'NavigationError', code: 'UNKNOWN_ROUTE', details: route })
                });
            }
            router.replace({ uri: uri });
            return ok(Object.freeze({ tag: 'Unit' }));
        }
    };
}
