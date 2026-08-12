import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
    'tools/lite-bundle.cjs',
    'tools/lite-webpack.config.cjs',
    'hvigorfile.ts',
    'entry/src/main/js/MainAbility/lite/app-entry.js'
];

let failed = false;
for (const relative of required) {
    const full = path.join(repo, relative);
    if (!fs.existsSync(full)) {
        console.error('[FAIL] missing: ' + relative);
        failed = true;
    }
}

// Generated artifacts must not bake the developer workstation into the HAP.
// Checking the local Lite output catches accidental absolute-path leakage
// without requiring the HarmonyOS SDK on CI.
const generatedRoot = path.join(repo, 'entry', 'build', 'default', 'intermediates', 'loader_out_lite');
if (fs.existsSync(generatedRoot)) {
    const forbidden = [repo, '/Volumes/ZCH/'];
    const files = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(full);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
                files.push(full);
            }
        }
    };
    visit(generatedRoot);
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const token of forbidden) {
            if (source.includes(token)) {
                console.error('[FAIL] absolute path leaked into ' + path.relative(repo, file));
                failed = true;
                break;
            }
        }
    }
}

if (failed) {
    process.exitCode = 1;
} else {
    console.log('[OK] Move25 Lite build bridge present and artifact paths are portable');
}
