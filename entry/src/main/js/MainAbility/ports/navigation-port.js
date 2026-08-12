/**
 * NavigationPort/v1
 *
 * Contract: page navigation requested by the domain as an effect.
 *
 * navigate(route) -> Result<NavigationError, Unit>
 *
 * route is one of: 'home' | 'break-due' | 'break-active' | 'settings' |
 * 'diagnostics' | 'health-monitoring'
 * The adapter translates routes to page paths; in host tests a recorder is used.
 */

export const NAVIGATION_ERROR_CODES = Object.freeze({
    UNKNOWN_ROUTE: 'UNKNOWN_ROUTE'
});

export function navigationError(code, details) {
    return Object.freeze({
        tag: 'NavigationError',
        code: code,
        details: details
    });
}
