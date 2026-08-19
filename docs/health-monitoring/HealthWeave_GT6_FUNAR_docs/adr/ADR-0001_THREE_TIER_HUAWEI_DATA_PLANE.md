# ADR-0001_THREE_TIER_HUAWEI_DATA_PLANE：采用三层华为数据平面

- 状态：Accepted
- 日期：2026-08-05

## 背景

手表直接 API、Health Service 和审批型 SDK 的能力差异巨大。

## 决策

A 层 Lite 直接传感器，B 层 Health Service 时间线，C 层 Wear Engine/行业 SDK；每层独立适配和门禁。

## 后果

- 正面：边界清晰、可测试、可替换、可审计。
- 代价：需要更多显式类型、契约、探针和治理文档。
- 复审触发：华为平台能力、法规、设备或产品预期用途发生重大变化。
