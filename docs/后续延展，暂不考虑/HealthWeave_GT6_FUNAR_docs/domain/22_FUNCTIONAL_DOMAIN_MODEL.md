# 函数式领域模型

以下是语言无关的代数数据类型；实际 JS/Kotlin/Swift/ArkTS 可使用带标签记录和智能构造器实现。

## 1. 基础类型

```ts
type Result<E, A> = { tag: 'Ok', value: A } | { tag: 'Err', error: E }

type Quality =
  | { tag: 'Good', score: number }
  | { tag: 'Degraded', score: number, reasons: QualityIssue[] }
  | { tag: 'Rejected', reasons: QualityIssue[] }

type Capability =
  | { tag: 'Unknown' }
  | { tag: 'Available', metadata: CapabilityMetadata }
  | { tag: 'RequiresPermission', scopes: string[] }
  | { tag: 'RequiresApproval', service: string }
  | { tag: 'Unsupported', reason: string }
  | { tag: 'TemporarilyUnavailable', retryAfter?: Instant }
```

## 2. 观测

```ts
type Observation<A> = {
  id: ObservationId
  kind: ObservationKind
  value: A
  interval: TimeInterval
  provenance: Provenance
  quality: Quality
  consent: ConsentReference
}
```

## 3. 派生指标

```ts
type DerivedMetric<A> = {
  metricId: MetricId
  value: A
  interval: TimeInterval
  algorithm: AlgorithmReference
  inputs: ObservationId[]
  quality: Quality
  uncertainty: Uncertainty
  evidence: EvidenceGrade
}
```

## 4. 洞察

```ts
type Insight = {
  facts: Fact[]
  trends: Trend[]
  deviations: Deviation[]
  possibleExplanations: ExplanationHypothesis[]
  actions: LowRiskAction[]
  redFlags: RedFlag[]
  limitations: Limitation[]
  confidence: Confidence
}
```

## 5. 纯函数

```text
normalize(raw, mapping) -> Result<NormalizationError, Observation>
assessQuality(observation, policy) -> Quality
computeMetric(definition, window) -> Result<MetricError, DerivedMetric>
updateBaseline(previous, qualifiedMetrics) -> Baseline
compareToBaseline(baseline, metric) -> Deviation
composeInsight(context) -> Insight
buildAiEnvelope(insight, consent, policy) -> Result<PolicyError, AiEnvelope>
```

## 6. 不可变性

原始观测不更新。平台记录被修正时，写入新版本并保留 `supersedes`。派生指标由输入哈希、算法版本和参数唯一标识，可重复计算和撤销。
