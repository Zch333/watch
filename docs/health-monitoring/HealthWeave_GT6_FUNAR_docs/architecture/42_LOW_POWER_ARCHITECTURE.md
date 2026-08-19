# 低功耗架构

## 1. 手表功耗原则

- 不持续运行 JS 轮询；
- 不默认打开原始 PPG/ACC；
- 使用系统已有健康采集结果优先；
- 短时会话必须由用户或明确任务触发；
- 屏幕不为倒计时常亮；
- 批量同步和压缩；
- 断连缓存有上限。

## 2. 采样预算

每个传感器会话声明：

```text
purpose, sensor, samplingRate, maxDuration,
expectedBatteryCost, screenPolicy, uploadPolicy,
abortConditions
```

研究模式显示预计电量影响，并在低电量、过热、未佩戴时停止。

## 3. 手机功耗

- 增量同步，不全量轮询；
- WorkManager 合并任务；
- 只重算受新数据影响的窗口；
- AI 报告按需或每日一次；
- 原始数据压缩和 Wi-Fi/充电策略可配置。

## 4. 功耗验收

必须与未安装应用的 GT6 基线做 A/B：典型日、运动日、睡眠夜、研究会话。任何“功能全面”不能以显著破坏 GT6 续航为代价。
