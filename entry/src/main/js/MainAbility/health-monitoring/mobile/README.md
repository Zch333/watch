# Android 健康端（待独立工程接入）

本目录定义 `健康.md` 要求的手机职责，不把 Android SDK 代码伪装进 Lite Wearable JS 模块。

主数据链：

```text
HUAWEI WATCH GT 6 (Lite, API 20)
  -> 华为运动健康同步
  -> Android Health Service Kit + Huawei Cloud REST
  -> HealthWeave 规范化账本
  -> 确定性分析
  -> 服务端 DeepSeek 受约束解释
  -> Android 报告/趋势/对话 UI
```

Android 原生工程必须实现 `PlatformHealthPort`，逐项申请最小 Scope，并使用本模块的契约 fixtures。实时心率/实时运动走获批的 Extended Health Service Kit 或 Wear Engine；步数/压力走近实时批同步；睡眠、SpO2、HRV、温度和 GPS 走周期增量同步。HRV 粒度与 GPS 路线为最高优先级 PoC。

禁止事项：

- 不在 GT6 API 20 中导入 API 24 的 `@hms.health.store` 或 `@hms.health.service`。
- 不把华为运动健康可展示的数据自动等同于第三方 Scope 已开放。
- 不把 DeepSeek API Key 放入 Android APK 或手表 HAP。
- 不把未验证的 HRV 聚合值当作 RRI，也不把 PPG PRV 写成 HRV。
