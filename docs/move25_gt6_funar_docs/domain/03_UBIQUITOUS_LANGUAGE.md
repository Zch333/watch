# 统一语言

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 核心术语

| 中文 | 英文/代码名 | 精确定义 |
|---|---|---|
| 节律 | `Rhythm` | 一段工作时长与一段活动时长的组合 |
| 工作段 | `FocusSegment` | 从周期起点开始的专注工作区间 |
| 活动段 | `BreakSegment` | 工作段结束后的活动区间 |
| 周期 | `Cycle` | `FocusSegment + BreakSegment` |
| 工作块 | `WorkBlock` | 一天中允许生成周期的半开区间 `[start, end)` |
| 工作日规则 | `WorkWeek` | 哪些星期允许生成计划 |
| 活动开始点 | `BreakStart` | 工作段结束时的领域时间点 |
| 提醒意图 | `ReminderIntent` | 领域希望系统在某时间触发的语义请求，不是系统通知对象 |
| 提醒计划 | `ReminderPlan` | 有序、去重的提醒意图集合 |
| 期望计划 | `DesiredPlan` | 依据当前设置、日期、暂停状态生成的领域计划 |
| 已注册计划 | `RegisteredPlan` | 系统适配器报告的实际注册集合 |
| 对账 | `Reconcile` | 计算期望集合与实际集合的差异并发出注册/取消效果 |
| 跳过下一次 | `SkipNext` | 抑制当前计划中的第一个未来活动开始点 |
| 暂停 | `Pause` | 在指定时间之前抑制活动提醒 |
| 活动会话 | `BreakSession` | 用户确认开始活动后形成的有限状态过程 |
| 能力 | `Capability` | 平台可验证的系统行为，例如后台精确定时、重启后保留 |
| 降级 | `DegradedMode` | 明确标注可靠性降低的运行方式，禁止静默启用 |

## 2. 禁用语言

下列词语容易掩盖真实语义，应避免：

- “后台保活”：本项目不追求保活，而追求系统代理调度；
- “计时器一直运行”：长期业务用绝对时间和系统提醒表达；
- “服务层”：必须说明是工作流函数、端口或适配器；
- “提醒对象”：区分领域 `ReminderIntent` 与平台请求结构；
- “每 25 分钟提醒”：准确说法是每个 30 分钟周期的第 25 分钟提醒；
- “支持”：必须附证据等级，例如 `SDK_CONFIRMED` 或 `DEVICE_CONFIRMED`。

## 3. 领域事件语言

事件使用已经发生的过去式：

- `ScheduleConfigured`
- `PlanEnableRequested`
- `PlanEnabled`
- `PlanDisabled`
- `PlanPaused`
- `PlanResumed`
- `PlanBlocked`
- `NextReminderSkipped`
- `PlanReconciled`
- `BreakBecameDue`
- `BreakStarted`
- `BreakFinished`
- `BreakSkipped`
- `BreakAcknowledged`
- `CapabilityObserved`

事件不是 UI 点击日志，也不是任意调试字符串。
