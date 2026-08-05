# 错误模型、一致性与恢复

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 错误分类

```text
DomainError
  - InvalidSchedule
  - CapabilityNotConfirmed
  - InvalidTransition
  - ReminderNoLongerExpected

PortError
  - ClockUnavailable
  - StoreReadFailed / StoreWriteFailed
  - ReminderPermissionDenied
  - ReminderCapacityExceeded
  - ReminderUnsupported
  - HapticsRejected

IntegrationError
  - PlatformPayloadInvalid
  - UnknownSystemCode
  - PartialRegistration
```

## 2. Result 管道

预期错误通过 `Result` 传播：

```text
parse -> validate -> decide -> execute -> reconcile
```

异常只用于程序缺陷或运行时不可恢复故障，并在适配器边界转换为稳定错误。

## 3. 一致性模型

本地快照与系统提醒无法原子提交，采用：

- 语义键；
- 幂等注册/取消；
- 逐项结果；
- 启动对账；
- 有界重试；
- 失败可见。

## 4. 重试策略

- 输入/权限错误不自动重试；
- 暂时性系统错误可在本次会话有限重试；
- 不在后台创建无限重试循环；
- 重试使用相同语义键；
- 超过阈值后进入 `Degraded` 并要求用户打开诊断页。

## 5. 时间异常

- 回调早于预期：记录并按容差策略决定；
- 回调明显迟到：若已超出活动窗口，只记录过期；
- 系统时间回拨：下次激活全量重算；
- 时区变化：重新解析未来本地计划；
- 重复回调：按语义键和会话状态幂等处理。
