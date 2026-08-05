# 命令、事件、效果与工作流目录

## 1. 命令

- `ConnectHuaweiHealth`
- `RequestDataScopes`
- `SyncHealthData(range)`
- `StartWatchSensorSession(type, duration)`
- `RevokeConsent(scope)`
- `ComputeDailyMetrics(day)`
- `RebuildBaseline(metric, range)`
- `GenerateDailyInsight(day)`
- `RequestAiExplanation(insightId)`
- `DeleteSubjectData`
- `ExportResearchBundle`

## 2. 领域事件

- `CapabilityObserved`
- `ConsentGranted` / `ConsentRevoked`
- `RawRecordIngested`
- `ObservationNormalized`
- `ObservationRejected`
- `QualityAssessed`
- `MetricComputed`
- `BaselineUpdated`
- `DeviationDetected`
- `InsightComposed`
- `AiExplanationAccepted` / `AiExplanationRejected`
- `DataDeleted`

## 3. 效果

- `ReadPlatformRecords`
- `WriteLedger`
- `ReadClock`
- `EncryptPayload`
- `InvokeAlgorithm`
- `CallAiProvider`
- `PublishNotification`
- `AppendAuditRecord`

## 4. 工作流示例

```text
SyncHealthData
  → validate consent and capability
  → effect: read platform records
  → normalize each record
  → quality gate
  → effect: append ledger
  → emit RawRecordIngested / ObservationNormalized / Rejected
  → schedule affected metric recomputation
```

每个工作流都是 `State × Command → Events × Effects` 的纯决策函数；解释器执行效果并返回新命令或事件。
