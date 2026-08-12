const path = require('path');

const repo = path.resolve(__dirname, '..');
const main = path.resolve(repo, 'entry/src/main/js/MainAbility');
const sdk = process.env.DEVECO_SDK_HOME || '';
const aceLoader = path.resolve(sdk, 'default/openharmony/js/build-tools/ace-loader');
const webpack = require(path.resolve(aceLoader, 'node_modules/webpack'));

module.exports = {
    mode: 'development',
    context: repo,
    entry: path.resolve(main, 'lite/app-entry.js'),
    target: 'web',
    devtool: false,
    output: {
        path: process.env.MOVE25_LITE_OUTPUT ||
            path.resolve(repo, 'entry/build/default/intermediates/move25-lite'),
        filename: 'app.js',
        // The Lite previewer evaluates an app file as a script rather than as
        // a Node CommonJS module.  A global library keeps the bundle usable in
        // that evaluator; the small ViewModel bridge is appended by
        // lite-bundle.cjs afterwards.
        library: { type: 'var', name: '__MOVE25_LITE_APP__', export: 'default' },
        environment: {
            arrowFunction: false,
            const: false,
            destructuring: false,
            forOf: false,
            optionalChaining: false,
            templateLiteral: false
        },
        clean: true
    },
    resolve: {
        extensions: ['.js'],
        alias: {
            '@system.storage$': path.resolve(main, 'lite/system-storage-shim.js'),
            '@system.vibrator$': path.resolve(main, 'lite/system-vibrator-shim.js'),
            '@system.router$': path.resolve(main, 'lite/system-router-shim.js'),
            '@babel/runtime': path.resolve(aceLoader, 'node_modules/@babel/runtime')
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [main],
                type: 'javascript/auto',
                use: {
                    loader: path.resolve(aceLoader, 'node_modules/babel-loader/lib/index.js'),
                    options: {
                        extends: path.resolve(aceLoader, 'babel.config.js')
                    }
                }
            }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            __MOVE25_BUILD_SHA__: JSON.stringify(process.env.MOVE25_BUILD_SHA || 'unknown'),
            __MOVE25_SDK_LABEL__: JSON.stringify(process.env.MOVE25_SDK_LABEL || 'Lite API 24'),
            __MOVE25_APP_VERSION__: JSON.stringify(process.env.MOVE25_APP_VERSION || 'unknown')
        })
    ]
};
