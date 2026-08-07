import { legacyAppTasks } from '@ohos/hvigor-ohos-plugin';
const fs = require('fs');
const path = require('path');
const liteBundle = require('./tools/lite-bundle.cjs');

const watchedLoaderRoots = new Set<string>();

function watchPreviewLoaderOutput() {
  // The command-line build must be allowed to exit.  DevEco Studio's daemon
  // remains alive and is the only process that needs this previewer bridge.
  if (process.argv.indexOf('--no-daemon') >= 0) {
    return;
  }
  const root = path.resolve(__dirname, 'entry/build/default/intermediates/loader_out_lite');
  if (watchedLoaderRoots.has(root)) {
    return;
  }
  fs.mkdirSync(root, { recursive: true });
  let timer: any = null;
  const onChange = (_event: string, filename: string) => {
    if (!filename || path.basename(String(filename)) !== 'app.js') {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      const target = path.join(root, 'default/js/MainAbility/app.js');
      try {
        if (!fs.existsSync(target)) {
          return;
        }
        const source = fs.readFileSync(target, 'utf8');
        // DevEco's previewer webpack writes the legacy manifest-loader wrapper
        // after Hvigor completes.  Patch only that stale form so our own write
        // does not cause an endless watcher loop.
        if (source.indexOf('manifest-loader.js') < 0 && source.indexOf('require("!!') < 0) {
          return;
        }
        liteBundle.patchExisting(path.resolve(__dirname, 'entry'));
      } catch (error) {
        console.warn('[Move25] preview loader patch deferred: ' + error.message);
      }
    }, 80);
  };
  fs.watch(root, { recursive: true }, onChange);
  watchedLoaderRoots.add(root);
  console.info('[Move25] watching DevEco Lite preview output: ' + root);
}

const move25LitePlugin = {
  pluginId: 'move25-lite-runtime',
  apply(node: any) {
    const patchModule = (candidate: any) => {
      if (!candidate || candidate.getNodeName() !== 'entry') {
        return;
      }
      watchPreviewLoaderOutput();
      let attached = false;
      const install = () => {
        if (attached) {
          return;
        }
        const generate = candidate.getTaskByName('default@LegacyGenerateLiteCode') ||
          candidate.getTaskByName('LegacyGenerateLiteCode');
        if (!generate) {
          console.warn('[Move25] Lite generate task is not available on entry node');
          return;
        }
        const packageHap = candidate.getTaskByName('default@LegacyPackageHap') ||
          candidate.getTaskByName('LegacyPackageHap');
        if (!packageHap) {
          console.warn('[Move25] Lite package task is not available on entry node');
          return;
        }
        attached = true;
        generate.afterRun(() => {
          // The repository is the source of truth for this single entry
          // module; avoiding the NormalizedFile proxy here also works with
          // older Hvigor builds whose public node-path wrapper is buggy.
          liteBundle.main();
        });
        // Some Lite SDK builds run a final loader-output synchronization after
        // LegacyGenerateLiteCode. Patch immediately before packaging as the
        // last deterministic point at which the generated JS is still read.
        packageHap.beforeRun(() => {
          liteBundle.main();
        });
      };
      // Module tasks are created while the entry node evaluates its system
      // plugin, so install at the node lifecycle boundary for clean builds.
      candidate.afterNodeEvaluate(install);
    };
    node.subNodes(patchModule);
  }
};

export default {
  system: legacyAppTasks, /* Built-in plugin of Hvigor. It cannot be modified. */
  plugins: [move25LitePlugin] /* Patch the Lite app entry after loader compilation. */
}
