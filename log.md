/Volumes/ZCH/devceo/DevEco-Studio.app/Contents/tools/node/bin/node /Volumes/ZCH/devceo/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js --mode module -p module=entry@default -p product=default -p requiredDeviceType=liteWearable assembleHap --analyze=normal --parallel --incremental --daemon
[Move25] watching DevEco Lite preview output: /Volumes/ZCH/project/watch/entry/build/default/intermediates/loader_out_lite
> hvigor UP-TO-DATE :entry:default@LegacyPreBuild...  
> hvigor UP-TO-DATE :entry:default@LegacyGenerateMetadata...  
> hvigor Finished :entry:default@PreCheckSyscap... after 1 ms
> hvigor UP-TO-DATE :entry:default@LegacyMergeProfile...  
> hvigor UP-TO-DATE :entry:default@LegacyGenerateJsManifest...  
> hvigor Finished :entry:default@BuildNativeWithCmake... after 1 ms
> hvigor Finished :entry:default@LegacySyscapTransform... after 1 ms
> hvigor UP-TO-DATE :entry:default@LegacyMakePackInfo...  
> hvigor UP-TO-DATE :entry:default@LegacyProcessProfile...  
> hvigor UP-TO-DATE :entry:default@LegacyGenerateLoaderJson...  
> hvigor Finished :entry:default@BuildNativeWithNinja... after 1 ms
> hvigor UP-TO-DATE :entry:default@LegacyProcessResource...  
> hvigor UP-TO-DATE :entry:default@ProcessLibs...  
> hvigor UP-TO-DATE :entry:default@LegacyCompileResource...  
> hvigor UP-TO-DATE :entry:default@DoNativeStrip...  
> hvigor Finished :entry:default@LegacyHookCompileResource... after 1 ms
> hvigor UP-TO-DATE :entry:default@CacheNativeLibs...  
> hvigor Finished :entry:default@LegacyCompileArkTS... after 1 ms
> hvigor Finished :entry:default@LegacyBuildJS... after 1 ms
> hvigor Finished :entry:default@LegacyProcessNodeAssets... after 1 ms
> hvigor Finished :entry:default@LegacyCompileLiteJS... after 596 ms
[Move25] patched Lite app entry: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/app.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/break-active/index.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/break-due/index.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/diagnostics/index.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/home/index.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/more/index.js
[Move25] patched Lite page module: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/pages/settings/index.js
asset app.js 200 KiB [emitted] [compared for emit] (name: main)
runtime modules 221 bytes 1 module
modules by path ./entry/src/main/js/MainAbility/ 167 KiB
modules by path ./entry/src/main/js/MainAbility/domain/*.js 89.2 KiB 19 modules
modules by path ./entry/src/main/js/MainAbility/adapters/ 34.7 KiB 13 modules
modules by path ./entry/src/main/js/MainAbility/app/*.js 16.3 KiB 5 modules
modules by path ./entry/src/main/js/MainAbility/ports/*.js 2.47 KiB 5 modules
modules by path ./entry/src/main/js/MainAbility/lite/*.js 3.98 KiB
./entry/src/main/js/MainAbility/lite/app-entry.js 3.2 KiB [built] [code generated]
+ 3 modules
modules by path ./entry/src/main/js/MainAbility/pages/ 20.5 KiB
./entry/src/main/js/MainAbility/pages/_app-shell.js 11.6 KiB [built] [code generated]
+ 3 modules
modules by path ../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/*.js 778 bytes
../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/interopRequireDefault.js 224 bytes [built] [code generated]
../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/typeof.js 554 bytes [built] [code generated]
webpack 5.72.1 compiled successfully in 666 ms
[Move25] patched Lite app entry: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/app.js
> hvigor Finished :entry:default@LegacyGenerateLiteCode... after 172 ms
> hvigor WARN: No signingConfig found for product default
> hvigor Finished :entry:default@LegacySignLiteBin... after 1 ms
asset app.js 200 KiB [compared for emit] (name: main)
runtime modules 221 bytes 1 module
modules by path ./entry/src/main/js/MainAbility/ 167 KiB
modules by path ./entry/src/main/js/MainAbility/domain/*.js 89.2 KiB 19 modules
modules by path ./entry/src/main/js/MainAbility/adapters/ 34.7 KiB 13 modules
modules by path ./entry/src/main/js/MainAbility/app/*.js 16.3 KiB 5 modules
modules by path ./entry/src/main/js/MainAbility/ports/*.js 2.47 KiB 5 modules
modules by path ./entry/src/main/js/MainAbility/lite/*.js 3.98 KiB
./entry/src/main/js/MainAbility/lite/app-entry.js 3.2 KiB [built] [code generated]
+ 3 modules
modules by path ./entry/src/main/js/MainAbility/pages/ 20.5 KiB
./entry/src/main/js/MainAbility/pages/_app-shell.js 11.6 KiB [built] [code generated]
+ 3 modules
modules by path ../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/*.js 778 bytes
../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/interopRequireDefault.js 224 bytes [built] [code generated]
../../devceo/DevEco-Studio.app/Contents/sdk/default/openharmony/js/build-tools/ace-loader/node_modules/@babel/runtime/helpers/typeof.js 554 bytes [built] [code generated]
webpack 5.72.1 compiled successfully in 594 ms
[Move25] patched Lite app entry: entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/app.js
> hvigor Finished :entry:default@LegacyPackageHap... after 866 ms
> hvigor WARN: No signingConfig found for product default
> hvigor Finished :entry:default@SignHap... after 1 ms
> hvigor Finished :entry:assembleHap... after 1 ms
> hvigor BUILD SUCCESSFUL in 3 s 120 ms

进程已结束，退出代码为 0

构建分析器 结果可用
