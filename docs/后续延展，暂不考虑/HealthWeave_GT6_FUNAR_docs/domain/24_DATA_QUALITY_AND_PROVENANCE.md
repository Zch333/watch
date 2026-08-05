# 数据质量与来源证明

## 1. 质量维度

- `Completeness`：预期窗口覆盖率；
- `Timeliness`：同步延迟；
- `SignalQuality`：噪声、运动伪影、饱和、接触；
- `WearQuality`：是否佩戴、佩戴持续性；
- `TemporalConsistency`：时间、时区、采样间隔；
- `SemanticValidity`：单位、值域、数据类型语义；
- `DeviceApplicability`：算法是否验证于类似设备和位置；
- `CrossSourceAgreement`：多源冲突程度。

## 2. 质量不是一个总分

总分可以用于 UI，但领域内部必须保留各维度和原因。不同算法关注不同维度。例如步数趋势可以容忍无 PPG，HRV 不能容忍间期误差。

## 3. 来源证明字段

```text
sourcePlatform
sourceApp
sourceDeviceModel
sourceDeviceIdPseudonym
firmwareVersion
apiName/apiVersion
originalDataType
samplingRate
sensorLocation
algorithmVendor/version
recordId
consentScope
processingChain[]
```

## 4. 可追溯计算

每个派生指标保存：

- 输入记录哈希；
- 算法容器/包版本；
- 参数；
- 代码提交；
- 质量策略版本；
- 执行环境；
- 结果与置信度。

用户看到的结论应可追溯到指标，指标可追溯到输入。
