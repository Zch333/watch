# Move25 Health Android 16

独立 Android 16（API 36）健康管理应用源码。实现遵循 `健康.md`、HealthWeave FUNAR 文档、Functional DDD 与六边形架构。当前只交付代码文件，未执行 Android 构建。

## 不可绕过的状态

- `MOVE25_HEALTH_RELEASE_ENABLED=false`：总发布门禁默认关闭。
- 用户开关、产品门禁和平台能力必须同时通过才允许采集。
- 默认不请求 Huawei Health/Wear Engine 权限、不启动传感器、不联网同步、不调用 AI、不发布健康提醒。
- DeepSeek 或其他模型密钥永远不进入 APK；应用只调用自有后端的已认证 API。
- GT6 是 Lite Wearable API 20。历史健康数据走 Huawei Health Service；短时传感器、设备状态和应用间通信走 Wear Engine/Lite 协议，绝不在手表端使用 API 24 `@hms.health.store`。

## 模块

| 模块 | 责任 |
|---|---|
| `domain` | 不依赖 Android/Huawei/HTTP/DB 的不可变领域、质量、算法、基线、报告、AI 验证 |
| `ports` | Health、Wear Engine、时间线、授权、AI、导出、审计等端口 |
| `application` | 命令→事件/效果工作流、同步、分析、报告、删除、导出用例 |
| `adapter-android` | Room 账本、Keystore 加密、DataStore 开关、WorkManager、通知/导出 |
| `adapter-huawei` | Android Health Service + Cloud REST + Wear Engine + Lite 消息协议适配 |
| `app` | Android 16 Compose 自适应 UI、MVU/ViewModel、手工组合根 |
| `contract-tests` | 平台同步、去重、游标、审计等共享端口契约测试 |

详细说明：

- [架构与限界上下文](docs/ARCHITECTURE.md)
- [需求追踪矩阵](docs/TRACEABILITY.md)
- [Huawei 正式接入约束](docs/HUAWEI_INTEGRATION.md)
- [ADK、Gemini Nano 与 App Functions](docs/AI_AND_APPFUNCTIONS.md)
- [发布/研究门禁](docs/RELEASE_GATES.md)
- [测试计划与延期项](docs/TEST_PLAN.md)
- [算法卡](docs/algorithm-cards/) 与 [AI 模型卡](docs/model-cards/)
- [官方 API 来源快照](docs/SOURCES.md)

## Android 16 约束

- `compileSdk=36`、`targetSdk=36`、`minSdk=28`；支持 Android 9+，针对 Android 16 的 edge-to-edge、预测返回和大屏自适应设计。
- 应用自身不直接读取手机人体传感器，因此不声明 Android 16 的 `android.permission.health.*`。未来若增加手机 SensorManager 采集，必须另行声明细粒度健康权限及隐私说明 Activity。
- 后台同步只交给 WorkManager；不使用无限轮询、常驻服务或固定频率传感器拉取。

## Huawei 真实接入

`adapter-huawei` 的领域适配与 Lite 协议是完整的；正式 SDK 调用通过 `HuaweiNativeClient` SPI 注入。这样做是硬性门禁，而非缺失实现：企业账号批准、应用 ID、签名指纹、正式 Scope、当前 Huawei SDK AAR 和 GT6 真机证据缺一时，运行态必须返回 `RequiresApproval`/`Unavailable`，不能伪造成已支持。

接入清单见 [docs/HUAWEI_INTEGRATION.md](docs/HUAWEI_INTEGRATION.md)，需求追踪见 [docs/TRACEABILITY.md](docs/TRACEABILITY.md)。

## 本次源码验证

```bash
bash tools/validate-source.sh
node --test lite-companion-contract/protocol.test.mjs
```

上述命令不解析 Android 依赖、不启动 Gradle，也不要求 DevEco/Android SDK。按需求，本次未执行 Android 构建；Gradle/KSP、模拟器和 GT6 真机验证继续作为发布门禁。
