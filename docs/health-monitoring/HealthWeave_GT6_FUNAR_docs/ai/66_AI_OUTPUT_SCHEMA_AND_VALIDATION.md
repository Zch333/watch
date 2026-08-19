# AI 输出 Schema 与验证

## JSON Schema 逻辑结构

```json
{
  "summary_title": "string",
  "overall_confidence": "low|medium|high",
  "data_quality_summary": {
    "status": "good|degraded|insufficient",
    "reasons": ["string"]
  },
  "observations": [
    {"statement": "string", "fact_ids": ["string"], "confidence": "low|medium|high"}
  ],
  "trends": [
    {"statement": "string", "metric_ids": ["string"], "direction": "up|down|stable|variable"}
  ],
  "possible_nonmedical_explanations": ["string"],
  "actions": [
    {"action": "string", "rationale": "string", "evaluation_window": "string"}
  ],
  "red_flags": [
    {"message": "string", "source_rule_id": "string"}
  ],
  "clinician_discussion_points": ["string"],
  "limitations": ["string"],
  "needs_clarification": ["string"]
}
```

## 验证器

1. JSON 语法和 Schema；
2. `fact_ids/metric_ids` 必须存在；
3. 数值文本与输入一致；
4. 禁止诊断和药物建议词；
5. 红旗必须覆盖确定性规则；
6. action 必须在 `allowed_actions`；
7. 置信度不得高于输入；
8. 输出中不得出现个人标识；
9. 未引用事实的陈述被删除或拒绝。

验证失败时不进行“让模型修一下”的无限循环；最多一次受限修复，否则使用模板报告。
