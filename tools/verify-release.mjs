import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repo, 'entry/src/main/config.json');
const sourceRoot = path.join(repo, 'entry/src/main/js/MainAbility');
let failed = false;

function fail(message) {
    console.error('[FAIL] ' + message);
    failed = true;
}

function pass(message) {
    console.log('[OK] ' + message);
}

function visit(directory, predicate, output = []) {
    if (!fs.existsSync(directory)) {
        return output;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            visit(full, predicate, output);
        } else if (predicate(full)) {
            output.push(full);
        }
    }
    return output;
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = config.app || {};
const moduleConfig = config.module || {};
const permissions = (moduleConfig.reqPermissions || []).map((item) => item.name).sort();
const allowedPermissions = ['ohos.permission.VIBRATE'];
const pages = moduleConfig.js && moduleConfig.js[0] ? moduleConfig.js[0].pages || [] : [];

if (app.bundleName !== 'com.move25.watch') {
    fail('bundleName must remain com.move25.watch');
} else {
    pass('stable bundleName');
}
if (!app.vendor || app.vendor === 'example') {
    fail('vendor must not be a template placeholder');
} else {
    pass('non-placeholder vendor');
}
if (!app.version || !Number.isInteger(app.version.code) || app.version.code <= 0 ||
    !/^\d+\.\d+\.\d+$/.test(String(app.version.name || ''))) {
    fail('version must contain a positive integer code and semantic x.y.z name');
} else {
    pass('release version ' + app.version.name + ' (' + app.version.code + ')');
}
if (JSON.stringify(permissions) !== JSON.stringify(allowedPermissions)) {
    fail('permission allowlist changed: ' + permissions.join(', '));
} else {
    pass('minimal permission allowlist');
}
if (moduleConfig.deviceType?.length !== 1 || moduleConfig.deviceType[0] !== 'liteWearable') {
    fail('deviceType must remain liteWearable only');
} else {
    pass('Lite Wearable target');
}

for (const page of pages) {
    for (const extension of ['.js', '.hml', '.css']) {
        const relative = 'entry/src/main/js/MainAbility/' + page + extension;
        if (!fs.existsSync(path.join(repo, relative))) {
            fail('configured page artifact missing: ' + relative);
        }
    }
}
if (pages.length === 7 && !failed) {
    pass('all configured page artifacts exist');
}

const sources = visit(sourceRoot, (file) => file.endsWith('.js'));
const forbiddenRuntime = [
    { pattern: /\bsetInterval\s*\(/, label: 'setInterval' },
    { pattern: /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/, label: 'network runtime' },
    { pattern: /@(?:system|ohos)\.(?:network|http|request|geolocation|sensor|health)/,
        label: 'forbidden platform capability' }
];
for (const file of sources) {
    const source = fs.readFileSync(file, 'utf8');
    for (const rule of forbiddenRuntime) {
        if (rule.pattern.test(source)) {
            fail(rule.label + ' found in ' + path.relative(repo, file));
        }
    }
}
if (!failed) {
    pass('no long timer, network, location, sensor or health runtime dependency');
}

const tracked = childProcess.execFileSync('git', ['ls-files'], {
    cwd: repo,
    encoding: 'utf8'
}).split(/\r?\n/).filter(Boolean);
const secretExtensions = /\.(?:p12|jks|keystore|pem|cer|crt|key)$/i;
const trackedSecrets = tracked.filter((file) => secretExtensions.test(file));
if (trackedSecrets.length > 0) {
    fail('tracked signing material: ' + trackedSecrets.join(', '));
} else {
    pass('no tracked signing material');
}

if (failed) {
    process.exitCode = 1;
} else {
    console.log('[OK] Move25 release invariants verified');
}
