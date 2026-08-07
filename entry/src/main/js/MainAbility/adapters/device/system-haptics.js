import vibrator from '@system.vibrator';
import { err, ok } from '../../domain/result.js';
import { HAPTICS_ERROR_CODES, hapticsError } from '../../ports/haptics-port.js';

const MODES = Object.freeze({
    BreakStart: 'short',
    BreakEnd: 'short',
    Error: 'long'
});

/** Lite Wearable vibrator adapter confirmed by the installed API 24 SDK. */
export function createSystemHaptics() {
    return {
        vibrate(pattern) {
            const mode = MODES[pattern];
            if (!mode) {
                return err(hapticsError(HAPTICS_ERROR_CODES.REJECTED, pattern));
            }
            try {
                // The Lite API is callback-based and returns void. A successful
                // call means the request was accepted; later platform failures
                // are logged because they cannot be returned synchronously.
                vibrator.vibrate({
                    mode: mode,
                    success: function () {
                        console.info('[Move25] vibration accepted: ' + pattern);
                    },
                    fail: function (message, code) {
                        console.error('[Move25] vibration failed: ' + code + ' ' + message);
                    }
                });
                return ok(Object.freeze({ tag: 'Unit' }));
            } catch (error) {
                return err(hapticsError(HAPTICS_ERROR_CODES.UNAVAILABLE,
                    error && error.message ? error.message : String(error)));
            }
        }
    };
}
