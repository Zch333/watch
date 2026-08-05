# 个人基线、置信度与 N-of-1 分析

## 1. 基线不是固定平均数

应按场景分层：睡眠、清醒静息、运动、工作日/周末、海拔、月经周期（用户同意时）和设备版本。

## 2. 建立条件

- 最小合格天数；
- 质量覆盖率；
- 排除明显旅行、疾病、自报异常的可选策略；
- 采用稳健统计；
- 缓慢更新，防止异常快速污染基线。

## 3. 置信度模型

```text
Confidence = f(
  quality,
  coverage,
  baselineSize,
  effectSize,
  persistence,
  crossMetricSupport,
  deviceEvidence,
  algorithmValidation
)
```

## 4. N-of-1

用户可标注咖啡、饮酒、运动、睡眠干预等事件。系统计算前后变化和不确定性，但明确观察性自我实验不能自动证明因果。
