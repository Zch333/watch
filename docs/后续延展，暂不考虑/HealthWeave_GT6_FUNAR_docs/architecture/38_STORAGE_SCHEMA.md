# 存储模型

## 1. 逻辑表

- `raw_records_quarantine`
- `observations`
- `observation_provenance`
- `quality_assessments`
- `derived_metrics`
- `algorithm_runs`
- `baselines`
- `insights`
- `ai_explanations`
- `consents`
- `capabilities`
- `sync_cursors`
- `audit_log`
- `tombstones`

## 2. 波形

原始波形不放普通关系表：

- 本地加密分块文件；
- 内容寻址哈希；
- 元数据入库；
- 明确保留期；
- 云端需单独同意。

## 3. 版本化

派生指标主键包含：

```text
subject + metric + interval + algorithmVersion + inputHash + parameterHash
```

算法升级不覆盖旧值。

## 4. 加密

- Android Keystore/Keychain/HarmonyOS 密钥库保护主密钥；
- 数据库和文件分层密钥；
- 云端每用户/租户密钥；
- 备份、日志和缓存同样受控。
