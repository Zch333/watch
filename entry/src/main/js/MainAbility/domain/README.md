# Move25 领域内核目录

本目录只包含普通 ES 函数、不可变记录和显式 `Result`，不依赖平台、UI、存储、时钟或提醒 API。

## 值类型与智能构造器

| 值类型 | 智能构造器 | 核心约束 |
|---|---|---|
| `MinuteOfDay` | `minuteOfDay` | 整数，`0 <= value < 1440` |
| `PositiveMinutes` | `positiveMinutes` | 整数，`1 <= value <= configuredLimit` |
| `LocalDate` | `localDate` | 有效公历日期，不读取系统时钟 |
| `Weekday` | `weekday` | `Mon` 至 `Sun` 的封闭集合 |
| `Instant` | `instant` | 安全整数范围内的 epoch milliseconds |
| `SemanticKey` | `semanticKey` | 非空字符串 |
| `SchemaVersion` | `schemaVersion` | 正整数 |
| `Rhythm` | `rhythm` | 已构造的工作分钟和活动分钟 |
| `WorkBlock` | `workBlock` | `start < end`，不允许跨日 |

## 强不变量

1. 工作块起点严格早于终点；跨块不重叠由后续日程规范化入口负责。
2. 节律的工作分钟和活动分钟都大于零。
3. 只有完整工作段能在块结束前完成时才生成 `BreakStart`。
4. 计划按日期和分钟排序，语义键唯一。
5. 暂停截止点之前（含截止点）的提醒不进入期望计划。
6. `SkipReminder` 最多删除一个匹配语义键。
7. 计划组合按语义键去重，并满足单位元、幂等和结合律。
8. 对账仅通过语义键划分注册、取消和不变集合。

## 带标签联合

- 命令：`ConfigureSchedule`、`EnablePlan`、`DisablePlan`、`PauseUntil`、`SkipNext`、`StartBreak`、`CompleteBreak`、`HandleReminderFired`、`ReconcilePlan`。
- 事件：`ScheduleConfigured`、`PlanEnabled`、`PlanDisabled`、`PlanPaused`、`NextReminderSkipped`、`BreakBecameDue`、`BreakStarted`、`BreakFinished`、`PlanReconciled`。
- 计划生命周期：`Disabled | Enabling | Enabled | Paused | Blocked`。
- 活动会话：`NoBreak | Due | Active | Finished`；结果为 `Completed | Skipped | Expired`。
- 提醒能力：`Unknown | Unsupported | RequiresApproval | Supported | Degraded`。
- 抑制状态：`NoPause | PauseThroughLocal` 与 `NoSkip | SkipReminder`。
- 结果：`Ok | Err`；领域错误统一为 `DomainError`。

## 错误

错误代码集中在 `errors.js`：值解析错误、工作块/节律错误、工作块重叠、空工作日、能力未确认、非法状态迁移和未知联合标签。预期失败必须返回 `Err(DomainError)`，不得依赖异常完成正常控制流。

