# AI 健康洞察架构

## 1. AI 的角色

AI 是解释器和交互层，不是原始生理信号算法，也不是最终安全裁决者。

## 2. 前置确定性管道

```text
Data quality
→ metrics
→ personal baseline
→ trend/change detection
→ deterministic safety rules
→ structured Insight
→ minimal AiEnvelope
```

## 3. AI 输入

默认只包含：

- 去标识用户上下文；
- 已计算统计、趋势和置信度；
- 数据覆盖和限制；
- 用户目标；
- 允许的建议范围；
- 权威知识检索片段。

默认不包含原始 PPG/ECG/ACC、姓名、精确地址和无关历史。

## 4. AI 输出处理

```text
Untrusted JSON
→ schema validation
→ numeric fact check
→ allowed-claim policy
→ red-flag consistency
→ prompt injection scan
→ language rendering
```

## 5. RAG

知识库只使用版本化权威指南、论文摘要和产品说明；每条知识有有效日期、地区和使用范围。检索文本不能修改系统规则。

## 6. 模型可替换

`AiInferencePort` 屏蔽提供商差异。模型选择根据：数据驻留、合规、成本、JSON 可靠性、中文质量、工具调用和评测结果。
