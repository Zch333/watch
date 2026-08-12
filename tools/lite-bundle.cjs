/* eslint-disable no-console */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ENTRY_MAIN = path.resolve(REPO, 'entry/src/main/js/MainAbility');
const WEBPACK_CONFIG = path.resolve(__dirname, 'lite-webpack.config.cjs');

function findFiles(root, predicate, result) {
    const output = result || [];
    if (!fs.existsSync(root)) {
        return output;
    }
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            findFiles(full, predicate, output);
        } else if (predicate(full)) {
            output.push(full);
        }
    }
    return output;
}

function sdkHome() {
    const candidates = [
        process.env.DEVECO_SDK_HOME,
        process.env.HVIGOR_SDK_HOME,
        path.resolve(path.dirname(process.execPath), '../../../sdk')
    ].filter(Boolean);
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = path.resolve(candidates[index]);
        if (fs.existsSync(path.join(candidate,
            'default/openharmony/js/build-tools/ace-loader/node_modules/webpack/bin/webpack.js'))) {
            return candidate;
        }
    }
    throw new Error('DevEco Lite SDK was not found; set DEVECO_SDK_HOME');
}

function sdkWebpack() {
    const sdk = sdkHome();
    const webpack = path.join(
        sdk,
        'default/openharmony/js/build-tools/ace-loader/node_modules/webpack/bin/webpack.js'
    );
    if (!fs.existsSync(webpack)) {
        throw new Error('Lite webpack was not found: ' + webpack);
    }
    return webpack;
}

function buildSha() {
    try {
        const sha = childProcess.execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
            cwd: REPO,
            encoding: 'utf8'
        }).trim();
        const dirty = childProcess.execFileSync('git', ['status', '--porcelain'], {
            cwd: REPO,
            encoding: 'utf8'
        }).trim().length > 0;
        return sha + (dirty ? '-dirty' : '');
    } catch (error) {
        return 'unknown';
    }
}

function appVersion() {
    try {
        const config = JSON.parse(fs.readFileSync(
            path.resolve(REPO, 'entry/src/main/config.json'),
            'utf8'
        ));
        return config.app && config.app.version && config.app.version.name
            ? String(config.app.version.name)
            : 'unknown';
    } catch (error) {
        return 'unknown';
    }
}

function buildBundle(modulePath) {
    const output = path.resolve(modulePath, 'build/default/intermediates/move25-lite');
    fs.mkdirSync(output, { recursive: true });
    const result = childProcess.spawnSync(process.execPath, [
        sdkWebpack(),
        '--config', WEBPACK_CONFIG,
        '--mode', 'development'
    ], {
        cwd: REPO,
        env: Object.assign({}, process.env, {
            MOVE25_LITE_OUTPUT: output,
            DEVICE_LEVEL: 'lite',
            DEVECO_SDK_HOME: sdkHome(),
            MOVE25_BUILD_SHA: buildSha(),
            MOVE25_SDK_LABEL: 'Lite API 24',
            MOVE25_APP_VERSION: appVersion()
        }),
        encoding: 'utf8'
    });
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.status !== 0) {
        throw new Error('Lite runtime webpack bundle failed with exit code ' + result.status);
    }
    return path.join(output, 'app.js');
}

function copyIntoLoaderOutput(modulePath, bundlePath) {
    const loaderRoot = path.resolve(modulePath, 'build');
    const targets = findFiles(loaderRoot, function (file) {
        return path.basename(file) === 'app.js' &&
            file.indexOf(path.sep + 'loader_out_lite' + path.sep) >= 0 &&
            file.indexOf(path.sep + 'js' + path.sep + 'MainAbility' + path.sep) >= 0;
    });
    if (targets.length === 0) {
        throw new Error('No loader_out_lite MainAbility/app.js was produced');
    }
    const bundle = fs.readFileSync(bundlePath, 'utf8') +
        '\n' +
        '// Lite FA runtime expects the loader-created ViewModel boundary.\n' +
        'try {\n' +
        '    var __move25_options__ = __MOVE25_LITE_APP__;\n' +
        '    if (__move25_options__ && __move25_options__.__esModule && __move25_options__.default) {\n' +
        '        __move25_options__ = __move25_options__.default;\n' +
        '    }\n' +
        '    var __move25_view_model__ = new ViewModel(__move25_options__);\n' +
        '    if (typeof module !== "undefined") {\n' +
        '        module.exports = __move25_view_model__;\n' +
        '    }\n' +
        '} catch (__move25_bridge_error__) {\n' +
        '    console.error("[Move25] Lite bridge failed: " +\n' +
        '        (__move25_bridge_error__ && __move25_bridge_error__.message ?\n' +
        '            __move25_bridge_error__.message : String(__move25_bridge_error__)));\n' +
        '}\n' +
        '// The Lite evaluator uses the script completion value as the app VM.\n' +
        'typeof __move25_view_model__ !== "undefined" ? __move25_view_model__ : undefined;\n';
    for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        fs.writeFileSync(target, bundle, 'utf8');
        const map = target + '.map';
        if (fs.existsSync(map)) {
            fs.unlinkSync(map);
        }
        console.info('[Move25] patched Lite app entry: ' + path.relative(REPO, target));
    }
}

function patchPageScriptOutputs(modulePath) {
    const loaderRoot = path.resolve(modulePath, 'build');
    const targets = findFiles(loaderRoot, function (file) {
        return path.basename(file) === 'index.js' &&
            file.indexOf(path.sep + 'loader_out_lite' + path.sep) >= 0 &&
            file.indexOf(path.sep + 'js' + path.sep + 'MainAbility' + path.sep + 'pages' + path.sep) >= 0;
    });
    for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        const source = fs.readFileSync(target, 'utf8');
        if (source.indexOf('__webpack_require__.r(__webpack_exports__);') < 0 ||
            source.indexOf('exports["default"]') < 0) {
            continue;
        }
        const patched = source
            .replace(
                /\/\*\*\*\/ \(function\([^)]*,\s*__webpack_exports__,\s*__webpack_require__\) \{\n\n?"use strict";\n__webpack_require__\.r\(__webpack_exports__\);\n/,
                '/***/ (function(__unused_webpack_module__, exports, __webpack_require__) {\n\n"use strict";\n'
            );
        if (patched === source) {
            throw new Error('Lite page module shape was not recognized: ' + path.relative(REPO, target));
        }
        fs.writeFileSync(target, patched, 'utf8');
        const map = target + '.map';
        if (fs.existsSync(map)) {
            fs.unlinkSync(map);
        }
        console.info('[Move25] patched Lite page module: ' + path.relative(REPO, target));
    }
}

function patchExisting(modulePath) {
    const bundlePath = path.resolve(modulePath, 'build/default/intermediates/move25-lite/app.js');
    if (!fs.existsSync(bundlePath)) {
        main();
        return;
    }
    copyIntoLoaderOutput(modulePath, bundlePath);
    patchPageScriptOutputs(modulePath);
}

function assertDeploySources() {
    const pagesRoot = path.resolve(ENTRY_MAIN, 'pages');
    const localRequires = [];
    const sources = findFiles(pagesRoot, function (file) {
        return path.basename(file) === 'index.js';
    });
    for (let index = 0; index < sources.length; index += 1) {
        const file = sources[index];
        const source = fs.readFileSync(file, 'utf8');
        if (/\b(?:import|require)\s*(?:[^;]*?from\s*)?["']\.\.?\//.test(source)) {
            localRequires.push(path.relative(REPO, file));
        }
    }
    if (localRequires.length > 0) {
        throw new Error(
            'Lite pages must not import local modules; use getApp() instead: ' +
            localRequires.join(', ')
        );
    }
}

function main() {
    const cliModulePath = require.main === module ? process.argv[2] : undefined;
    let modulePath = cliModulePath || path.resolve(REPO, 'entry');
    // Hvigor's public getNodePath() is the project path for legacy modules in
    // some SDK builds and the module path in others.  Normalize both forms so
    // the hook remains valid in DevEco Studio and in the CLI.
    if (!fs.existsSync(path.resolve(modulePath, 'build')) &&
        fs.existsSync(path.resolve(modulePath, 'entry/build'))) {
        modulePath = path.resolve(modulePath, 'entry');
    }
    assertDeploySources();
    const bundle = buildBundle(modulePath);
    copyIntoLoaderOutput(modulePath, bundle);
    patchPageScriptOutputs(modulePath);
}

if (require.main === module) {
    main();
}

module.exports = { main, patchExisting };
