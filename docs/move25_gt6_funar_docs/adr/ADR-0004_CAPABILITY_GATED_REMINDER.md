# ADR-0004：提醒能力门禁

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

后台提醒是显式 `ReminderCapability`。只有 G0–G6 真机探针通过，可靠 Standalone 模式才可启用。

## 后果

产品可能在早期被判定 No-Go；这是诚实的工程结果，而不是架构失败。
