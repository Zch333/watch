# GT6 + Health Service P0 PoC

## 固定记录环境

每次记录：GT6 型号、固件、地区、华为账号类型、华为运动健康版本、手机型号/系统、Android App 版本、Health Service SDK 版本、Scope 审批单号、时区与采集日期。

## 数据项目

对 `huawei-data-plan.js` 的 9 项逐一执行：心率、步数/活动、睡眠、SpO2、压力、HRV、温度、运动记录、GPS 路线。

每项必须保存去标识 fixture，并回答：

1. 用户授权与 Scope 是否成功；
2. GT6 是否实际产生并同步；
3. Android SDK 与云 REST 是否都返回；
4. 原始数据类型、单位、时间字段和 record ID；
5. 返回的是聚合、采样点还是逐拍/逐点数据；
6. 首次与增量同步延迟；
7. 重复、迟到、修正和撤回行为；
8. 离线、断连、重启、跨时区行为；
9. 日志是否没有健康值和个人标识；
10. 删除是否传播到所有派生物和云端。

## 最高风险验收

- HRV：明确区分 vendor HRV、RRI/NN、PPG pulse interval；没有 RRI 时禁止运行 HRV RMSSD。
- GPS：正式 Scope 和 Route 开放策略有证据；未通过前不上传原始坐标，不承诺完整轨迹。
- SpO2/温度：记录同步频率、模式/测量条件与历史粒度；不做诊断筛查。

PoC 只更新能力证据，不直接修改 `HEALTH_MONITORING_RELEASE_ENABLED`。
