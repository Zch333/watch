/**
 * Cross-version host-test runner (P1-04).
 *
 * `node --test` argument forms are not portable across versions/shells:
 *   - Node 18: a directory argument works, a glob is NOT expanded (Windows
 *     cmd/pwsh do not expand it either);
 *   - Node 21+ (native glob): the glob works, but on Windows a bare
 *     directory argument is treated as a test file and fails.
 *
 * This runner enumerates the *.test.mjs files itself and hands Node an
 * explicit file list, so `npm test` behaves identically on Node 18.13+ and
 * Node 21+ from any working directory or shell.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Running this file under `node --test` would be a false green: the Node
// test runner detects the recursive spawn and skips the child processes
// while still exiting 0. Fail loudly instead (review MEDIUM: P1-04).
if (process.env.NODE_TEST_CONTEXT) {
    console.error('run.mjs must not be executed under `node --test`; use `node run.mjs` or `npm test`.');
    process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
    .filter(function (name) {
        return name.endsWith('.test.mjs');
    })
    .sort()
    .map(function (name) {
        return join(here, name);
    });

if (files.length === 0) {
    console.error('no *.test.mjs files found in ' + here);
    process.exit(1);
}

const result = spawnSync(process.execPath, ['--test'].concat(files), {
    stdio: 'inherit'
});
process.exit(result.status === null ? 1 : result.status);
