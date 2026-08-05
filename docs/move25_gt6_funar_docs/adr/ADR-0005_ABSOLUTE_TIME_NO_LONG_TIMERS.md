# ADR-0005：绝对时间与禁止长 JS 定时器

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

领域保存绝对结束时间和本地日程；长期提醒由系统调度。`setInterval`/长 `setTimeout` 不承担后台正确性。

## 后果

UI 息屏后停止刷新；重新可见时重算；必须实现系统提醒适配器或明确不可用。
