# Android、iOS、HarmonyOS 接入矩阵

## 1. 推荐战略

| 平台 | 优先级 | 主接入 | 辅助接入 | 说明 |
|---|---:|---|---|---|
| Android（vivo X200） | P0 | Huawei Health Service Kit | Wear Engine、Health Connect | 首发；处理后台同步和厂商省电 |
| HarmonyOS 手机 | P1 | Health Service Kit ArkTS | Wear Engine、分布式能力 | 与华为生态联动最好 |
| iPhone | P1/P2 | Health Service Kit 支持形态 | HealthKit 作为其他数据源 | 不假设 GT6 全部数据自动进入 HealthKit |
| GT6 Lite Wearable | P1 | Lite 传感器 + Wear Engine Lite | 本地缓存和 UI | 功耗和 API 限制最大 |
| 云端 | P0 | 自有 API | AI 提供商、FHIR 出口 | 不直接依赖设备 SDK |

## 2. Android 首发架构

- Kotlin 原生应用；
- 华为 Health Service Kit 适配器；
- Wear Engine 适配器作为可选模块；
- Jetpack WorkManager 做增量同步；
- Room + SQLCipher 或平台加密数据库；
- Health Connect 作为跨生态出口/补充源；
- 领域和契约可用 Kotlin 或平台中立 JSON Schema 描述。

## 3. iOS

- Swift 原生 Health Service/iOS 接入；
- 可选 HealthKit 适配器；
- 权限按数据类型逐项请求；
- 背景刷新和数据可见性遵守 Apple 规则；
- 不承诺 Android Wear Engine 同等实时能力。

## 4. HarmonyOS

- ArkTS 原生 Health Service Kit；
- 根据最新文档验证 Phone/Tablet、Wearable、LiteWearable 路径；
- 华为特有链路封装于适配器，不进入核心。

## 5. 为什么不强行“一套跨平台代码”

健康 SDK、授权 UI、后台执行、蓝牙、密钥链和应用商店规则均高度平台化。正确共享对象是：

- 领域词汇和 JSON 契约；
- 算法规范和测试向量；
- 云 API；
- 统计与 AI 输出模式；
- 端口契约测试。

UI 和健康平台适配器优先原生。Kotlin Multiplatform 可在 Android/iOS 共享纯领域，但不应把 HarmonyOS 支持作为 V1 的关键路径。
