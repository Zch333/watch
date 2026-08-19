# 子域与限界上下文地图

## 1. 上下文

### Device Acquisition

负责 GT6/Lite、Wear Engine、Health Service、HealthKit、Health Connect 的平台记录获取，不解释健康含义。

### Consent & Capability

负责权限、开放能力、设备支持、用户授权、撤回和目的限制。

### Health Ledger

维护追加型规范化健康时间线、去重、来源和同步游标。

### Signal Quality

评估波形、佩戴、采样、完整性、运动伪影和时间一致性。

### Metric Computation

执行版本化确定性算法，产生派生指标。

### Personal Baseline

建立个体、场景和时间分层的参考分布。

### Insight

把观测、基线、变化、证据和建议组合成结构化洞察。

### AI Explanation

把结构化洞察解释为用户可读内容，不改变核心事实。

### Intervention

久坐、睡眠、恢复和运动提醒；不自行读取未经授权数据。

### Research Governance

管理数据集、算法卡、模型卡、验证、实验和发布门禁。

## 2. 关系

```text
Platform APIs → [Acquisition ACL] → Health Ledger
Consent/Capability ────────────────┘
Health Ledger → Signal Quality → Metric Computation
Metric Computation + Ledger → Personal Baseline → Insight
Insight → AI Explanation → Mobile/Watch UI
Insight → Intervention Policy → Notification adapters
Research Governance → all algorithm/model release gates
```

`Acquisition ACL` 是反腐层，防止华为、Apple、Android 的字段和语义渗入核心。
