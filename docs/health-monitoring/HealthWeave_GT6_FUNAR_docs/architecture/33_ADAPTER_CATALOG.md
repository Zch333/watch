# 适配器目录与反腐层

## 1. 华为

- `HuaweiHealthServiceAndroidAdapter`
- `HuaweiHealthServiceHarmonyAdapter`
- `HuaweiHealthServiceIosAdapter`（以实际 SDK/云接入为准）
- `HuaweiWearEngineAndroidAdapter`
- `HuaweiWearEngineHarmonyAdapter`
- `Gt6LiteSensorAdapter`
- `HuaweiIndustrySdkAdapter`（独立受限模块）

## 2. 平台健康仓

- `AndroidHealthConnectAdapter`
- `AppleHealthKitAdapter`
- `FhirExportAdapter`

## 3. 存储和云

- `RoomEncryptedLedgerAdapter`
- `SqlCipherFeatureStoreAdapter`
- `ObjectStorageRawSignalAdapter`
- `PostgresMetadataAdapter`
- `S3CompatibleArtifactAdapter`

## 4. AI

- `OpenAiCompatibleAdapter`
- `AnthropicCompatibleAdapter`
- `LocalModelAdapter`
- `RagKnowledgeAdapter`

提供商 API 只能接收统一 `AiEnvelope`，不能渗入业务代码。

## 5. 适配器状态

每个适配器声明：

```text
Experimental | Probed | ContractTested | Validated | Production
```

“能编译”不等于“Validated”。
