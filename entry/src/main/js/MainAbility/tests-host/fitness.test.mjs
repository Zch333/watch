import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import test from 'node:test';

// The repo root is derived from this file's own location, never hardcoded:
// a checked-out copy elsewhere must run the same assertions against ITS
// source (P1-04). fitness.test.mjs sits at
//   <root>/entry/src/main/js/MainAbility/tests-host/fitness.test.mjs
// so six levels up is the repository root.
const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const JS_ROOT = join(ROOT, 'entry/src/main/js/MainAbility');
const DOMAIN_DIR = join(JS_ROOT, 'domain');

function walkJs(dir, files) {
    const out = files || [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            walkJs(full, out);
        } else if (name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

function readRelative(path) {
    return readFileSync(path, 'utf8');
}

test('FF-01: domain has zero platform and timer dependencies', () => {
    const banned = [
        '@system.',
        '@ohos.',
        '@kit.',
        '@hms.',
        'Date.now(',
        'setInterval(',
        'setTimeout(',
        'Math.random('
    ];
    const domainFiles = walkJs(DOMAIN_DIR);
    assert.equal(domainFiles.length > 0, true);
    for (const file of domainFiles) {
        const source = readRelative(file);
        for (const pattern of banned) {
            assert.equal(source.includes(pattern), false,
                relative(JS_ROOT, file) + ' contains banned pattern ' + pattern);
        }
    }
});

test('FF-02: domain never imports ports, adapters, app or pages', () => {
    const domainFiles = walkJs(DOMAIN_DIR);
    for (const file of domainFiles) {
        const source = readRelative(file);
        assert.equal(/from\s+['"](\.\.\/)+(ports|adapters|app|pages)\//.test(source), false,
            relative(JS_ROOT, file) + ' imports an outer layer');
        assert.equal(source.includes("from '../../"), false,
            relative(JS_ROOT, file) + ' escapes the MainAbility root');
    }
});

test('FF-03: no .ets or Stage/ArkTS artifacts exist under the JS module', () => {
    const all = walkJs(JS_ROOT);
    const ets = all.filter(function (f) {
        return f.endsWith('.ets');
    });
    assert.equal(ets.length, 0);
    const files = [];
    (function collect(dir) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                collect(full);
            } else {
                files.push(full);
            }
        }
    })(join(JS_ROOT, '..'));
    assert.equal(files.some(function (f) {
        return f.endsWith('.ets');
    }), false, 'no ArkTS files allowed');
});

test('platform: config.json stays legacy FA and requests only confirmed device permissions', () => {
    const config = JSON.parse(readRelative(join(JS_ROOT, '../../config.json')));
    assert.equal(config.module.deviceType.includes('liteWearable'), true);
    assert.equal(config.module.abilities[0].srcLanguage, 'js');
    assert.equal(config.module.abilities[0].type, 'page');
    const permissions = config.module.reqPermissions || [];
    assert.deepEqual(permissions.map(function (permission) {
        return permission.name;
    }), ['ohos.permission.VIBRATE']);
    for (const permission of permissions) {
        assert.equal(/network|location|health/i.test(permission.name), false,
            'unexpected permission: ' + permission.name);
    }
});

test('platform: Lite page entry scripts are self-contained', () => {
    const pagesDir = join(JS_ROOT, 'pages');
    const pageFiles = [];
    for (const pageName of readdirSync(pagesDir)) {
        const pageFile = join(pagesDir, pageName, 'index.js');
        try {
            if (statSync(pageFile).isFile()) {
                pageFiles.push(pageFile);
            }
        } catch (error) {
            // Non-page directories (for example mvu/) are intentionally
            // ignored; config.json is the deploy-page source of truth.
        }
    }
    assert.equal(pageFiles.length, 6);
    for (const file of pageFiles) {
        const source = readRelative(file);
        assert.equal(/(?:from|require\s*\()\s*['"]\.\.?\//.test(source), false,
            relative(JS_ROOT, file) + ' retains a local deploy-time import');
        assert.equal(source.includes('../_app-shell.js'), false,
            relative(JS_ROOT, file) + ' must call the app facade through getApp()');
    }
});

test('behavior: repeat reconcile converges and capability-unknown enable fails', async () => {
    const decideMod = await import('../domain/decide.js');
    const cmd = await import('../domain/commands.js');
    const model = await import('../domain/model.js');
    const ev = await import('../domain/evolve.js');
    const st = await import('../domain/state.js');
    const val = await import('../domain/values.js');
    const cal = await import('../domain/calendar.js');

    const OFFSET = 480;
    const d = val.localDate(2026, 8, 6).value;
    const at = function (m) {
        return cal.localToInstant(d, val.minuteOfDay(m).value, OFFSET).value;
    };
    const facts = {
        now: at(600),
        localWall: { localDate: d, minuteOfDay: val.minuteOfDay(600).value },
        utcOffsetMinutes: OFFSET,
        registeredPlan: [],
        horizonDays: 3
    };

    // Capability unknown => enable must not succeed.
    let state = model.initialDomainState();
    const blocked = decideMod.decide(state, cmd.enablePlan(), facts);
    assert.equal(blocked.tag, 'Ok');
    assert.equal(blocked.value.events[0].tag, 'PlanBlocked');

    // Supported capability => enable registers; second reconcile converges.
    state = ev.evolveAll(state, [{
        tag: 'CapabilityObserved',
        capability: st.capabilitySupported({ maxPendingCount: 30 })
    }]).value;
    const enabled = decideMod.decide(state, cmd.enablePlan(), facts);
    assert.equal(enabled.tag, 'Ok');
    state = ev.evolveAll(state, enabled.value.events).value;
    const registerEffect = enabled.value.effects.find(function (e) {
        return e.tag === 'RegisterReminders';
    });
    assert.equal(registerEffect.intents.length > 0, true);

    const registered = registerEffect.intents;
    const again = decideMod.decide(state, cmd.reconcilePlan(), Object.assign({}, facts, {
        registeredPlan: registered
    }));
    assert.equal(again.tag, 'Ok');
    const diff = again.value.events[again.value.events.length - 1].diff;
    assert.deepEqual(diff.toRegister, []);
    assert.deepEqual(diff.toCancel, []);
});
