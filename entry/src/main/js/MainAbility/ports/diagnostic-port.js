/**
 * DiagnosticPort/v1
 *
 * Contract: append-only ring of diagnostics for debugging and audits.
 *
 * append(entry) -> Result<DiagnosticError, Unit>
 * readRecent(limit) -> Result<DiagnosticError, Entry[]>
 *
 * - Entries must never contain health data, account identifiers or unrelated
 *   personal information.
 * - readRecent returns newest-first, capped at limit.
 */

export const DIAGNOSTIC_ERROR_CODES = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE'
});

export function diagnosticError(code, details) {
    return Object.freeze({
        tag: 'DiagnosticError',
        code: code,
        details: details
    });
}
