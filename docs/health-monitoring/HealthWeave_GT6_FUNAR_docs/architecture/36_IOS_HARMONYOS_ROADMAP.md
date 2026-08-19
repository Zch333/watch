# iOS 与 HarmonyOS 路线图

## iOS

1. 验证 Huawei Health Service Kit 的 iOS 接入形态和 GT6 数据覆盖；
2. Swift 实现统一 `PlatformHealthPort`；
3. 可选 HealthKit 读取其他数据；
4. 逐项权限请求，不默认全量；
5. 对华为数据与 HealthKit 数据进行来源去重；
6. 不承诺实时 Wear Engine 与 Android 完全等价。

## HarmonyOS

1. 使用最新 Health Service Kit ArkTS 文档；
2. 实现 HarmonyOS 原生授权和增量同步；
3. 验证 Wear Engine 与 LiteWearable 的连接；
4. 利用华为生态能力，但保持领域协议不变。

## 共享策略

- OpenAPI/JSON Schema 共享；
- 统计测试向量共享；
- Prompt、规则和 Algorithm Card 共享；
- 平台 SDK 和 UI 原生。
