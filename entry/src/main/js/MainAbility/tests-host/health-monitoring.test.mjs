import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    HEALTH_MONITORING_RELEASE_ENABLED,
    HUAWEI_DATA_SCOPES,
    activationState,
    analyzeNOfOne,
    assessAggregateQuality,
    buildAiEnvelope,
    buildPersonalBaseline,
    buildStructuredHealthSummary,
    capability,
    composeInsight,
    createBuiltinAlgorithmPort,
    createDeepSeekServerAdapter,
    createDualAnalysisEngine,
    createHybridHuaweiHealthPort,
    createMemoryAuditPort,
    createMemoryCapabilityStore,
    createMemoryConsentStore,
    createMemoryExportPort,
    createMemoryPlatformHealthPort,
    createMemoryTimelineStore,
    createRingBuffer,
    createWatchHealthCompanion,
    decideHealth,
    detectPersistentChange,
    evaluateFeature,
    evaluateProductReleaseGate,
    evaluateResearchGate,
    executeAlgorithm,
    featurePortfolio,
    initialHealthState,
    initialPocMatrix,
    mergeTimelines,
    normalizeObservation,
    planHealthSync,
    quality,
    sensorSessionRequest,
    summarizePeriod,
    validateAiOutput,
    validateHealthPorts
} from '../health-monitoring/index.js';

const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const HEALTH_ROOT = join(ROOT, 'entry/src/main/js/MainAbility/health-monitoring');

function walk(dir, files) {
    const out = files || [];
    readdirSync(dir).forEach(function (name) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full, out); }
        else { out.push(full); }
    });
    return out;
}

function raw(kind, value, unit, offset, additions) {
    const start = 1786464000000 + (offset || 0) * 60000;
    return Object.assign({
        subjectId: 'subject-pseudo-1',
        kind: kind,
        value: value,
        unit: unit,
        startEpochMs: start,
        endEpochMs: start + 60000,
        consentScope: 'scope:' + kind,
        provenance: {
            sourcePlatform: 'Huawei Health',
            sourceApp: 'Huawei Health',
            sourceDeviceModel: 'HUAWEI WATCH GT 6',
            sourceDeviceIdPseudonym: 'device-pseudo-1',
            firmwareVersion: 'probe-required',
            apiName: 'fixture',
            apiVersion: 'fixture',
            originalDataType: kind,
            recordId: kind + '-' + String(offset || 0)
        }
    }, additions || {});
}

function observation(kind, value, unit, offset, additions) {
    const result = normalizeObservation(raw(kind, value, unit, offset, additions));
    assert.equal(result.tag, 'Ok', JSON.stringify(result));
    return result.value;
}

function metric(id, value, index, tag) {
    return Object.freeze({
        tag: 'DerivedMetric', id: id + '-' + index, metricId: id,
        value: value, unit: 'au', quality: quality(tag || 'Good', {}, []).value
    });
}

test('health gate: compiled feature is release-disabled and no user intent can activate it', () => {
    assert.equal(HEALTH_MONITORING_RELEASE_ENABLED, false);
    assert.equal(activationState(false).tag, 'Dormant');
    assert.equal(activationState(true).tag, 'Dormant');
    assert.equal(activationState(true).effectsAllowed, false);
});

test('health workflow: dormant state emits no collection, sync, AI or notification effects', () => {
    const state = initialHealthState({ userEnabled: true });
    const commands = [
        { tag: 'SyncHealthData', scope: 'heart', capabilityId: 'heart_rate' },
        { tag: 'StartWatchSensorSession', scope: 'heart', request: {} }
    ];
    commands.forEach(function (command) {
        const result = decideHealth(state, command, { now: 1 });
        assert.equal(result.tag, 'Err');
        assert.equal(result.error.code, 'HEALTH_MONITORING_DORMANT');
    });
    assert.deepEqual(planHealthSync(state.activation, 1000000, {}).value, []);
});

test('health privacy: delete propagation remains available while the feature is dormant', () => {
    const result = decideHealth(initialHealthState(), {
        tag: 'DeleteSubjectData', subjectId: 'subject-pseudo-1'
    }, { now: 1 });
    assert.equal(result.tag, 'Ok');
    assert.deepEqual(result.value.effects.map(function (effect) { return effect.tag; }), [
        'StopHealthCollection', 'RevokePlatformAuthorization', 'DeleteLocalHealthData',
        'DeleteCloudHealthData', 'DeleteDerivedHealthData', 'AppendDeletionAudit'
    ]);
});

test('observation: subject, unit, interval, consent and provenance are mandatory', () => {
    assert.equal(normalizeObservation({}).error.code, 'SUBJECT_REQUIRED');
    assert.equal(normalizeObservation(raw('HEART_RATE', 60, 'wrong', 0)).error.code,
        'INVALID_OR_MISSING_UNIT');
    const item = observation('HEART_RATE', 61, 'bpm', 1);
    assert.equal(item.provenance.sourceDeviceModel, 'HUAWEI WATCH GT 6');
    assert.equal(item.consentScope, 'scope:HEART_RATE');
    assert.equal(Object.isFrozen(item), true);
});

test('observation: structured route and external blood pressure values validate safely', () => {
    const route = observation('GPS_ROUTE_POINT', {
        latitude: 1.3, longitude: 103.8, elevation: 22
    }, 'lat_lon', 0);
    assert.equal(route.kind, 'GPS_ROUTE_POINT');
    assert.equal(normalizeObservation(raw('GPS_ROUTE_POINT', {
        latitude: 100, longitude: 103.8
    }, 'lat_lon', 1)).error.code, 'VALUE_OUT_OF_RANGE');
    assert.equal(observation('BLOOD_PRESSURE_EXTERNAL', {
        systolic: 120, diastolic: 80
    }, 'mmHg', 2).kind, 'BLOOD_PRESSURE_EXTERNAL');
});

test('quality: insufficient coverage rejects a window before inference', () => {
    const item = observation('SPO2', 96, 'percent', 0, {
        quality: quality('Good', { completeness: 0.2 }, []).value
    });
    const assessed = assessAggregateQuality(item, { minimumCoverage: 0.6 });
    assert.equal(assessed.tag, 'Rejected');
    assert.equal(assessed.reasons.includes('INSUFFICIENT_COVERAGE'), true);
});

test('timeline: hybrid/repeated reads dedupe by platform identity and merge is idempotent', () => {
    const first = observation('STEP_COUNT', 100, 'count', 0);
    const duplicate = observation('STEP_COUNT', 100, 'count', 0, { syncedAt: 2 });
    assert.equal(first.id, duplicate.id);
    const merged = mergeTimelines([first], [duplicate]);
    assert.equal(merged.length, 1);
    assert.equal(mergeTimelines(merged, merged).length, 1);
});

test('algorithms: RRI produces HRV while PPG intervals remain explicitly PRV', () => {
    const rri = [];
    const ppg = [];
    for (let index = 0; index < 24; index += 1) {
        rri.push(observation('RRI', 900 + (index % 3) * 10, 'ms', index));
        ppg.push(observation('PPG_PULSE_INTERVAL', 880 + (index % 4) * 8, 'ms', index));
    }
    const hrv = executeAlgorithm('cardio.hrv_rmssd', rri);
    const prv = executeAlgorithm('cardio.prv_rmssd', ppg);
    assert.equal(hrv.tag, 'Ok');
    assert.equal(prv.tag, 'Ok');
    assert.equal(hrv.value.metricId, 'cardio.hrv_rmssd');
    assert.equal(prv.value.metricId, 'cardio.prv_rmssd');
    assert.equal(prv.value.components[0].value, 'PRV_RMSSD');
    assert.equal(prv.value.algorithmVersion.length > 0, true);
    assert.equal(prv.value.inputHash.length > 0, true);
});

test('baseline/change: robust baseline needs history and change needs persistence', () => {
    const history = [55, 56, 54, 55, 56, 55, 54].map(function (value, index) {
        return metric('cardio.resting_hr_median', value, index);
    });
    const baseline = buildPersonalBaseline('cardio.resting_hr_median', history);
    assert.equal(baseline.tag, 'Ok');
    const recent = [70, 71, 72].map(function (value, index) {
        return metric('cardio.resting_hr_median', value, index + 10);
    });
    const change = detectPersistentChange(recent, baseline.value);
    assert.equal(change.tag, 'Ok');
    assert.equal(change.value.changed, true);
    assert.equal(change.value.medicalMeaning, 'not_assessed');
});

test('feature engineering: all health.md core groups become deterministic structured features', () => {
    const observations = [
        observation('HEART_RATE', 61, 'bpm', 0),
        observation('RESTING_HEART_RATE', 56, 'bpm', 1),
        observation('HRV_VENDOR', 48, 'ms', 2),
        observation('SLEEP_DURATION', 421, 'min', 3),
        observation('SLEEP_START_MINUTE', 1380, 'minute_of_day', 4),
        observation('SLEEP_START_MINUTE', 1390, 'minute_of_day', 5),
        observation('SLEEP_START_MINUTE', 1370, 'minute_of_day', 6),
        observation('SPO2', 96, 'percent', 7),
        observation('STRESS_VENDOR', 41, 'vendor_score', 8),
        observation('STEP_COUNT', 11824, 'count', 9),
        observation('SKIN_TEMPERATURE', 33.2, 'celsius', 10),
        observation('WORKOUT_DURATION', 45, 'min', 11),
        observation('WORKOUT_RPE', 6, 'score_1_10', 12),
        observation('GPS_ROUTE_POINT', { latitude: 1.3, longitude: 103.8, elevation: 20 }, 'lat_lon', 13)
    ];
    const summary = buildStructuredHealthSummary(observations, {
        targetSleepMinutes: 480,
        profile: { maximumHeartRate: 190 },
        temperatureBaseline: { median: 32.8 }
    });
    assert.equal(summary.tag, 'Ok');
    assert.equal(summary.value.deterministic, true);
    assert.equal(summary.value.activity.steps.total, 11824);
    assert.equal(summary.value.sleep.sleepDebtMinutes, 59);
    assert.equal(summary.value.workout.sessionRpeLoad, 270);
    assert.equal(summary.value.temperature.skinBaselineDelta > 0, true);
    assert.equal(summary.value.route.routeScopeValidated, false);
    assert.equal(summary.value.hrv.granularityMustBeProbed, true);
});

test('reports/N-of-1: daily-weekly-monthly reports are deterministic and never causal', () => {
    const metrics = [metric('steps', 8000, 1), metric('steps', 10000, 2)];
    ['daily', 'weekly', 'monthly'].forEach(function (period) {
        const report = summarizePeriod(period, metrics, []);
        assert.equal(report.tag, 'Ok');
        assert.equal(report.value.correlationIsNotCausation, true);
    });
    const experiment = analyzeNOfOne(
        [metric('sleep', 400, 1), metric('sleep', 410, 2), metric('sleep', 420, 3)],
        [metric('sleep', 430, 4), metric('sleep', 440, 5), metric('sleep', 450, 6)],
        'earlier_bedtime'
    );
    assert.equal(experiment.value.causalClaimAllowed, false);
});

test('portfolio: regulated, research, consent and capability gates never silently enable', () => {
    const dormant = featurePortfolio(initialHealthState());
    assert.equal(dormant.every(function (item) { return item.availability.tag === 'Dormant'; }), true);
    const active = { activation: { tag: 'Active' }, capabilities: {}, researchMode: false, cloudAiEnabled: false };
    const arrhythmia = dormant.find(function (item) { return item.feature.id === 'arrhythmia'; }).feature;
    const fall = dormant.find(function (item) { return item.feature.id === 'fall_detection'; }).feature;
    assert.equal(evaluateFeature(arrhythmia, active).reason, 'REGULATED_PRODUCT_REQUIRED');
    assert.equal(evaluateFeature(fall, active).reason, 'RESEARCH_MODE_AND_CONSENT_REQUIRED');
});

test('Huawei plan: 8 requested groups plus GPS exist and HRV/GPS are highest-risk PoCs', () => {
    assert.equal(HUAWEI_DATA_SCOPES.length, 9);
    const hrv = HUAWEI_DATA_SCOPES.find(function (item) { return item.id === 'hrv'; });
    const route = HUAWEI_DATA_SCOPES.find(function (item) { return item.id === 'gps_route'; });
    assert.equal(hrv.probe, 'P0_HIGHEST_RISK');
    assert.equal(route.probe, 'P0_HIGHEST_RISK');
    assert.equal(initialPocMatrix().every(function (item) { return item.status === 'NotRun'; }), true);
});

test('research/release: missing evidence blocks research and product publication', () => {
    assert.equal(evaluateResearchGate({}).error.code, 'RESEARCH_GATE_BLOCKED');
    assert.equal(evaluateProductReleaseGate({}).error.code, 'PRODUCT_RELEASE_BLOCKED');
    assert.equal(evaluateResearchGate({
        researchConsent: true,
        capability: { tag: 'Available' },
        algorithmCard: { status: 'Validated' },
        datasetCard: { status: 'Approved' },
        license: { compatible: true },
        powerBudget: { approved: true },
        environment: 'isolated_research'
    }).tag, 'Ok');
});

test('watch sessions: brief/research power budgets and bounded offline buffer are enforced', () => {
    assert.equal(sensorSessionRequest({
        mode: 'Brief', purpose: 'heart check', sensor: 'heart_rate', maxDurationMs: 300001
    }).error.code, 'SENSOR_DURATION_EXCEEDS_BUDGET');
    assert.equal(sensorSessionRequest({
        mode: 'Research', purpose: 'study', sensor: 'acc', maxDurationMs: 1000
    }).error.code, 'RESEARCH_CONSENT_REQUIRED');
    const buffer = createRingBuffer(2);
    buffer.append({ sequence: 1 });
    buffer.append({ sequence: 2 });
    buffer.append({ sequence: 3 });
    assert.deepEqual(buffer.read().value.map(function (item) { return item.sequence; }), [2, 3]);
    buffer.acknowledge(2);
    assert.deepEqual(buffer.read().value.map(function (item) { return item.sequence; }), [3]);
});

test('watch companion: release-disabled UI cannot open a sensor session', () => {
    let openCount = 0;
    const companion = createWatchHealthCompanion({
        releaseEnabled: false,
        userEnabled: true,
        sensorPort: { open() { openCount += 1; return { tag: 'Ok' }; } }
    });
    const result = companion.startBriefSession({
        purpose: 'heart check', sensor: 'heart_rate', maxDurationMs: 30000
    });
    assert.equal(result.error.code, 'HEALTH_MONITORING_DORMANT');
    assert.equal(openCount, 0);
});

test('ports: required health port contracts are explicit', () => {
    const ledger = createMemoryTimelineStore();
    const ports = {
        PlatformHealthPort: createMemoryPlatformHealthPort(),
        TimelineStorePort: ledger,
        ConsentStorePort: createMemoryConsentStore(),
        CapabilityStorePort: createMemoryCapabilityStore(),
        AlgorithmPort: createBuiltinAlgorithmPort(),
        AuditPort: createMemoryAuditPort(),
        ClockPort: { now() { return { tag: 'Ok', value: 1 }; } }
    };
    assert.equal(validateHealthPorts(ports).tag, 'Ok');
    assert.equal(validateHealthPorts({}).error.code, 'HEALTH_PORTS_INVALID');
    assert.equal(createMemoryExportPort(ledger).exportSubject('nobody').tag, 'Ok');
});

test('hybrid Huawei data plane merges Android SDK and cloud REST records idempotently', () => {
    const record = raw('HEART_RATE', 60, 'bpm', 0);
    function plane(records) {
        return {
            capabilities() { return { tag: 'Ok', value: { heart_rate: { tag: 'Available' } } }; },
            requestAuthorization() { return { tag: 'Ok', value: true }; },
            read() { return { tag: 'Ok', value: records }; },
            changes() { return { tag: 'Ok', value: { records: records, cursor: 'c1' } }; },
            revoke() { return { tag: 'Ok', value: true }; }
        };
    }
    const hybrid = createHybridHuaweiHealthPort(plane([record]), plane([record]));
    assert.equal(hybrid.read({}).value.length, 1);
    assert.equal(hybrid.changes({}).value.records.length, 1);
});

test('AI: raw facts require consent and unsupported references/medical claims are rejected', () => {
    const metricValue = {
        id: 'm1', metricId: 'cardio.resting_hr_median', value: 61, unit: 'bpm',
        quality: quality('Good', {}, []).value,
        provenance: { source: 'deterministic' }
    };
    const insight = composeInsight({ metrics: [metricValue] }).value;
    assert.equal(buildAiEnvelope(insight, {}).error.code, 'AI_CONSENT_REQUIRED');
    const envelope = buildAiEnvelope(insight, { aiExplanation: true }, {}).value;
    const invalid = {
        observations: [{ statement: '确诊疾病', fact_ids: ['unknown'] }],
        trends: [], actions: [], red_flags: [], limitations: []
    };
    assert.equal(validateAiOutput(invalid, envelope).error.code, 'AI_MEDICAL_CLAIM_REJECTED');
});

test('DeepSeek: adapter is server-only, secret stays in header, JSON mode is mandatory', () => {
    assert.throws(function () {
        createDeepSeekServerAdapter({ postJson() {} }, { executionTier: 'android' });
    }, /server-only/);
    let captured = null;
    const adapter = createDeepSeekServerAdapter({
        postJson(path, body, headers) {
            captured = { path: path, body: body, headers: headers };
            return { tag: 'Ok', value: { observations: [], trends: [], actions: [], red_flags: [], limitations: [] } };
        }
    }, {
        executionTier: 'server',
        apiKeyProvider: { read() { return { tag: 'Ok', value: 'test-secret-not-real' }; } }
    });
    adapter.complete({ insightId: 'i1' });
    assert.equal(captured.body.response_format.type, 'json_object');
    assert.equal(JSON.stringify(captured.body).includes('test-secret-not-real'), false);
    assert.equal(captured.headers.Authorization, 'Bearer test-secret-not-real');
});

test('dual engine: unavailable/untrusted AI always falls back to deterministic report', () => {
    const metricValue = {
        id: 'm1', metricId: 'steps', value: 10000, unit: 'count',
        quality: quality('Good', {}, []).value,
        provenance: { source: 'deterministic' }
    };
    const insight = composeInsight({ metrics: [metricValue] }).value;
    const engine = createDualAnalysisEngine({
        complete() { return { tag: 'Err', error: { code: 'OFFLINE' } }; }
    });
    const result = engine.explain(insight, { aiExplanation: true }, {});
    assert.equal(result.value.tag, 'DeterministicOnly');
    assert.equal(result.value.deterministic.generatedBy, 'deterministic-template/1.0.0');
});

test('fitness/health.md: watch bundle has no API 24 Health Store import, health permission or client secret', () => {
    const sourceFiles = walk(HEALTH_ROOT).filter(function (file) { return file.endsWith('.js'); });
    const watchSource = readFileSync(join(ROOT, 'entry/src/main/js/MainAbility/lite/app-entry.js'), 'utf8');
    const config = readFileSync(join(ROOT, 'entry/src/main/config.json'), 'utf8');
    sourceFiles.concat([join(ROOT, 'entry/src/main/js/MainAbility/lite/app-entry.js')]).forEach(function (file) {
        const source = readFileSync(file, 'utf8');
        assert.equal(source.includes("from '@hms.health.store'"), false, relative(ROOT, file));
        assert.equal(source.includes("from '@hms.health.service'"), false, relative(ROOT, file));
    });
    assert.equal(watchSource.includes('DeepSeekServerAdapter'), false);
    assert.equal(config.includes('ohos.permission.READ_HEALTH_DATA'), false);
    assert.equal(config.includes('ohos.permission.ACTIVITY_MOTION'), false);
    assert.equal(config.includes('ohos.permission.LOCATION'), false);
});
