# 架构适应度函数

## 自动规则

1. `domain` 模块禁止依赖 Huawei/Android/Apple/HTTP/DB SDK。
2. 任何 `DerivedMetric` 必须包含 algorithmVersion、inputHash、quality 和 provenance。
3. AI 请求只能由 `AiEnvelopeBuilder` 创建。
4. 原始波形上传调用必须带显式 consent token。
5. 产品算法注册表中缺少 Algorithm Card 时构建失败。
6. 医学关键词扫描发现诊断/药物声明时阻止发布。
7. 许可证扫描和 SBOM 必须通过。
8. 日志静态扫描禁止健康值和身份标识。
9. 提醒/传感器会话必须包含功耗预算和最大时长。
10. 任何 `Unknown` 能力不得映射为 UI 的“已支持”。

## 运行时规则

- 同步延迟超过阈值时报告显示过期；
- AI 数值一致性失败回退模板；
- 数据质量拒绝率突然变化触发平台/固件调查；
- 模型漂移或设备版本变化暂停高风险洞察。
