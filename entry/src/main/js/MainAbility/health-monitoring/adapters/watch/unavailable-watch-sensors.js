import { err, ok } from '../../domain/model.js';

export function createUnavailableWatchSensorPort() {
    return {
        listSensors() {
            return ok(Object.freeze([
                Object.freeze({ id: 'heart_rate', capability: 'Unknown' }),
                Object.freeze({ id: 'wear_state', capability: 'Unknown' }),
                Object.freeze({ id: 'acc', capability: 'Unknown' }),
                Object.freeze({ id: 'ppg_raw', capability: 'RequiresApproval' })
            ]));
        },
        open() { return err('WATCH_SENSOR_DEVICE_PROBE_REQUIRED'); },
        close() { return ok(true); }
    };
}
