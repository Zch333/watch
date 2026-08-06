import { ok } from '../../domain/result.js';

/**
 * Recording NavigationPort adapter: records requested routes.
 */
export function createRecordingNavigation() {
    const routes = [];
    return {
        navigate(route) {
            routes.push(route);
            return ok(Object.freeze({ tag: 'Unit' }));
        },
        _routes() {
            return routes.slice();
        }
    };
}
