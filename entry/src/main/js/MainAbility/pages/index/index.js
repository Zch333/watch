export default {
    data: {
        version: '1.0.0',
        logCount: 0,
        logCountText: ''
    },
    onInit() {
        console.info('[Move25 Probe] page onInit, version=' + this.version);
    },
    onLogTap() {
        this.logCount += 1;
        this.logCountText = '已写入日志 ' + this.logCount + ' 次';
        console.info('[Move25 Probe] log button tapped, count=' + this.logCount);
    }
};
