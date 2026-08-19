# Move25 Health Android 16

独立 Android 16（API 36）健康管理应用源码。实现遵循 `健康.md`、HealthWeave FUNAR 文档、Functional DDD 与六边形架构。

## 不可绕过的状态

- `MOVE25_HEALTH_RELEASE_ENABLED=false`：总发布门禁默认关闭。
- 用户开关、产品门禁和平台能力必须同时通过才允许采集。
- 久坐提醒默认关闭；未通过发布证据、用户健康开关、`health:activity` 同意和提醒开关时，不调度后台检查。
- 默认不请求 Huawei Health/Wear Engine 权限、不启动传感器、不联网同步、不调用 AI、不发布健康提醒。
- DeepSeek 或其他模型密钥永远不进入 APK；应用只调用自有后端的已认证 API。
- GT6 是 Lite Wearable API 20。历史健康数据走 Huawei Health Service；短时传感器、设备状态和应用间通信走 Wear Engine/Lite 协议。

## 模块

| 模块 | 责任 |
|---|---|
| `domain` | 不依赖 Android/Huawei/HTTP/DB 的不可变领域、质量、算法、基线、报告、AI 验证与久坐提醒决策 |
| `ports` | Health、Wear Engine、时间线、授权、AI、导出、审计、久坐设置/状态/调度端口 |
| `application` | 命令到事件/效果工作流、同步、分析、报告、删除、导出与久坐提醒用例 |
| `adapter-android` | Room、Keystore、DataStore、WorkManager、通知与导出 |
| `adapter-huawei` | Android Health Service + Cloud REST + Wear Engine + Lite 消息协议适配 |
| `app` | Android 16 Compose 自适应 UI、MVU/ViewModel、手工组合根 |
| `contract-tests` | 平台同步、去重、游标、审计等共享端口契约测试 |

详细说明：

- [架构与限界上下文](docs/ARCHITECTURE.md)
- [久坐提醒限界上下文](docs/SEDENTARY_REMINDERS.md)
- [需求追踪矩阵](docs/TRACEABILITY.md)
- [Huawei 正式接入约束](docs/HUAWEI_INTEGRATION.md)
- [ADK、Gemini Nano 与 App Functions](docs/AI_AND_APPFUNCTIONS.md)
- [发布/研究门禁](docs/RELEASE_GATES.md)
- [测试计划与延期项](docs/TEST_PLAN.md)

## Android 16 约束

- `compileSdk=36`、`targetSdk=36`、`minSdk=28`。
- 后台同步与久坐检查只交给 WorkManager；不使用无限轮询、常驻服务或固定频率传感器拉取。
- 久坐判定只接受合格、最新且能证明连续静止区段的数据；日累计值、缺失数据和过期数据均不会触发提醒。
- `POST_NOTIFICATIONS` 在需要发布提醒时才由 UI 请求；领域层只接收权限事实。

## Huawei 真实接入

`adapter-huawei` 的领域适配与 Lite 协议是完整的；正式 SDK 调用通过 `HuaweiNativeClient` SPI 注入。企业账号批准、应用 ID、签名指纹、正式 Scope、当前 Huawei SDK AAR 和 GT6 真机证据缺一时，运行态必须返回 `RequiresApproval` 或 `Unavailable`，不能伪造成已支持。

## 源码验证

```bash
bash tools/validate-source.sh
node --test lite-companion-contract/protocol.test.mjs
```

领域与应用模块包含久坐提醒 JUnit 测试。完整 Gradle/KSP、模拟器、通知权限流程和 GT6 真机验证继续作为发布门禁。
