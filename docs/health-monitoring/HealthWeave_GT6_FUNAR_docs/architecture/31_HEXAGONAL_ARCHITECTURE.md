# 六边形架构

## 1. 内核

内核包含领域值、纯算法、工作流、策略和契约。它不知道：

- Huawei Health Service Kit；
- Wear Engine；
- Android Room/WorkManager；
- iOS HealthKit；
- HarmonyOS ArkTS；
- HTTP、数据库、AI SDK。

## 2. 驱动端口

- `SyncUseCase`
- `AnalyzeDayUseCase`
- `QueryTimelineUseCase`
- `GenerateInsightUseCase`
- `ManageConsentUseCase`
- `StartSensorSessionUseCase`
- `ExportUseCase`

## 3. 被驱动端口

见 `32_PORT_CONTRACTS.md`。

## 4. 适配器规则

平台对象必须先进入 Anti-Corruption Layer：

```text
HuaweiDataCollector → HuaweiRecordMapper → RawObservation
AppleHealthAdapter  → AppleRecordMapper  → RawObservation
HealthConnectAdapter→ AndroidMapper      → RawObservation
```

映射器负责语义转换和错误，不在 UI 中直接读平台字段。

## 5. 部署形态

V1 采用模块化单体：

- 单个 Android App；
- 可选单个云后端；
- 单个 GT6 Lite HAP；
- 逻辑上下文通过模块和接口隔离。

不为每个上下文创建微服务。
