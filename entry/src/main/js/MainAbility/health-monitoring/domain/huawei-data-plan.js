export const HUAWEI_DATA_SCOPES = Object.freeze([
    Object.freeze({
        id: 'heart_rate', dataKinds: Object.freeze(['HEART_RATE', 'RESTING_HEART_RATE']),
        channel: 'realtime_and_history', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P0'
    }),
    Object.freeze({
        id: 'steps_activity', dataKinds: Object.freeze(['STEP_COUNT', 'ACTIVE_MINUTES', 'SEDENTARY_MINUTES']),
        channel: 'near_realtime', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P0'
    }),
    Object.freeze({
        id: 'sleep', dataKinds: Object.freeze(['SLEEP_DURATION', 'SLEEP_START_MINUTE', 'SLEEP_END_MINUTE', 'SLEEP_STAGE_VENDOR']),
        channel: 'periodic', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P0'
    }),
    Object.freeze({
        id: 'spo2', dataKinds: Object.freeze(['SPO2']), channel: 'periodic', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P1'
    }),
    Object.freeze({
        id: 'stress', dataKinds: Object.freeze(['STRESS_VENDOR']), channel: 'near_realtime', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P1'
    }),
    Object.freeze({
        id: 'hrv', dataKinds: Object.freeze(['HRV_VENDOR', 'RRI']), channel: 'periodic', priority: 1,
        scope: 'https://www.huawei.com/healthkit/hearthealth.read', approval: 'advanced', probe: 'P0_HIGHEST_RISK'
    }),
    Object.freeze({
        id: 'temperature', dataKinds: Object.freeze(['SKIN_TEMPERATURE', 'BODY_TEMPERATURE']),
        channel: 'periodic', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P1'
    }),
    Object.freeze({
        id: 'workout', dataKinds: Object.freeze([
            'WORKOUT_DURATION', 'WORKOUT_DISTANCE', 'WORKOUT_PACE', 'WORKOUT_SPEED',
            'WORKOUT_ELEVATION', 'WORKOUT_CADENCE', 'WORKOUT_CALORIES'
        ]), channel: 'realtime_and_history', priority: 1,
        scope: null, scopeResolution: 'approved_huawei_catalog', approval: 'required', probe: 'P0'
    }),
    Object.freeze({
        id: 'gps_route', dataKinds: Object.freeze(['GPS_ROUTE_POINT']), channel: 'periodic', priority: 1,
        scope: 'https://www.huawei.com/healthkit/location.read', approval: 'route_policy_review',
        probe: 'P0_HIGHEST_RISK'
    })
]);

export const SYNC_CHANNELS = Object.freeze({
    Realtime: Object.freeze({
        ids: Object.freeze(['heart_rate', 'workout']),
        source: 'Android Extended Health Service Kit or approved Wear Engine',
        policy: 'foreground_or_os_managed_session'
    }),
    NearRealtime: Object.freeze({
        ids: Object.freeze(['steps_activity', 'stress']),
        source: 'Android Health Service Kit',
        policy: 'incremental_batched'
    }),
    Periodic: Object.freeze({
        ids: Object.freeze(['sleep', 'spo2', 'hrv', 'temperature', 'gps_route']),
        source: 'Android Health Service Kit plus Cloud REST',
        policy: 'overlapping_cursor_sync'
    })
});

export function scopeById(id) {
    for (let index = 0; index < HUAWEI_DATA_SCOPES.length; index += 1) {
        if (HUAWEI_DATA_SCOPES[index].id === id) { return HUAWEI_DATA_SCOPES[index]; }
    }
    return null;
}

export function initialPocMatrix() {
    return Object.freeze(HUAWEI_DATA_SCOPES.map(function (item) {
        return Object.freeze({
            id: item.id,
            scope: item.scope,
            scopeResolution: item.scopeResolution || 'explicit_in_health_md',
            status: 'NotRun',
            device: 'HUAWEI WATCH GT 6',
            requiredEvidence: Object.freeze([
                'authorized_scope', 'actual_payload', 'sampling_or_sync_interval',
                'data_granularity', 'device_firmware', 'phone_and_health_app_version'
            ])
        });
    }));
}
