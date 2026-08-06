import { initApp } from './pages/_app-shell.js';

export default {
    onCreate() {
        console.info('Move25 Application onCreate');
        initApp({});
    },
    onDestroy() {
        console.info('Application onDestroy');
    }
};
