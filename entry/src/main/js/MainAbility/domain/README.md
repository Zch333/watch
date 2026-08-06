# Move25 领域内核目录

本目录只包含普通 ES 函数、不可变记录和显式 `Result`，不依赖平台、UI、存储、时钟或提醒 API。扫描约束：不得出现 `@system.*`、`@ohos.*`、`@hms.*`、`setInterval`、长 `setTimeout`、`Date.now()`、`Math.random()`。

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

## 模块职责

| 模块 | 内容 |
|---|---|
| `calendar.js` | 纯公历代数：`weekdayOf`（Sakamoto）、`addDays`、`enumerateDates`、`localToInstant`/`instantToLocal`（固定 UTC 偏移，偏移是显式事实） |
| `settings.js` | 设置聚合：`defaultScheduleSettings`（周一至五、09:00–12:00 + 13:30–18:00、25/5）、`parseScheduleInput`、`normalizeWorkBlocks`/`normalizeWeekdays`（排序、去重、拒绝重叠） |
| `plan.js` | 提醒计划代数：块/日/范围计划生成、`combinePlans`、`applySuppression`、`diffPlans`、`firstFutureIntent`、`findIntentByKey` |
| `policy.js` | 能力门禁策略：`canEnableReliable`、`chooseSchedulingStrategy`（Recurring/Rolling/SingleNext）、`applyStrategyWindow` |
| `guidance.js` | 确定性动作建议轮换，无随机数 |
| `decide.js` | 纯决策函数 `decide : State × Command × Facts -> Result<Decision>`，返回事件 + 效果描述 |
| `evolve.js` | 纯状态转换 `evolve : State × Event -> Result<State>`、`reduceTemporalState`（启动归约过期会话/暂停） |
| `snapshot.js` | 快照创建、`migrateSnapshot`（纯迁移，损坏显式失败）、`rehydrateFromRaw`、`freshSnapshot` |
| `effects.js` | 效果 ADT：`RegisterReminders`/`CancelReminders`/`Vibrate`/`Navigate`/`EmitDiagnostic`（持久化不是效果：由命令处理器在结算后直接持久化最终状态） |
| `settle.js` | 纯结算：`settlePlanLifecycle` 依据注册结果门禁 `PlanEnabled`（全失败→`PlanBlocked`、部分失败→保持 `Enabling`、成功→`Enabled`） |
| `commands.js`/`events.js` | 命令与事件工厂（带 `tag` 的不可变记录） |
| `state.js` | 计划生命周期、活动会话、能力状态的构造器 |
| `model.js` | `initialDomainState` / `withDomainState` 聚合状态 |
| `option.js` | `Some`/`None` 最小 Option 实现 |
| `result.js`/`errors.js` | `Ok`/`Err` 与统一领域错误代码 |

## 决策语义（decide.js）

`Facts` 是外壳已取得的值：`now`（Instant）、`localWall`（LocalWallTime）、`utcOffsetMinutes`、`registeredPlan`、`horizonDays`。领域不读取时钟。

- `EnablePlan`：能力非 `Supported` 时返回 `PlanBlocked`，不产生注册效果；已启用时幂等重对账。
- `PauseUntil`/`PauseForToday`/`PauseForOneHour`：以绝对 Instant 表达，同时生成 `PauseThroughLocal` 用于计划抑制；全部由 `decide` 纯推导。
- `SkipNext`：按"无跳过"的当前抑制计划取第一个未来意图，最多抑制一个语义键；无未来提醒返回 `NOTHING_TO_SKIP`。
- `HandleReminderFired`：按当前抑制计划（含恰在当前分钟的意图）校验语义键；过期/已暂停回调仅产生诊断。
- `StartBreak`/`StartBreakNow`：`endsAt = now + breakMinutes`，确定性轮换指导建议；`CompleteBreak`/`SkipBreak`/`AcknowledgeBreakFinished` 走显式状态机，非法迁移返回 `INVALID_STATE_TRANSITION`。
- `ReconcilePlan`：幂等——对 `diff` 应用后再对账差异为空。

## 强不变量

1. 工作块起点严格早于终点；跨块不重叠（规范化入口拒绝重叠）。
2. 节律的工作分钟和活动分钟都大于零。
3. 只有完整工作段能在块结束前完成时才生成 `BreakStart`。
4. 计划按日期和分钟排序，语义键唯一；组合满足单位元、幂等、结合律、交换律。
5. 暂停截止点之前（含截止点）的提醒不进入期望计划。
6. `SkipReminder` 最多删除一个匹配语义键。
7. 对账仅通过语义键划分注册、取消和不变集合。
8. 能力不是 `Supported` 时不得将计划呈现为"可靠后台已启用"。
9. 快照迁移为纯函数；损坏快照显式失败，不回退默认而不告知。

## 带标签联合

- 命令：`ConfigureSchedule`、`EnablePlan`、`DisablePlan`、`PauseUntil`、`PauseForToday`、`PauseForOneHour`、`SkipNext`、`StartBreak`、`StartBreakNow`、`CompleteBreak`、`SkipBreak`、`AcknowledgeBreakFinished`、`HandleReminderFired`、`ReconcilePlan`、`ObserveCapability`。
- 事件：`ScheduleConfigured`、`PlanEnableRequested`、`PlanEnabled`、`PlanDisabled`、`PlanPaused`、`PlanResumed`、`PlanBlocked`、`NextReminderSkipped`、`BreakBecameDue`、`BreakStarted`、`BreakFinished`、`BreakSkipped`、`BreakAcknowledged`、`PlanReconciled`、`CapabilityObserved`。
- 计划生命周期：`Disabled | Enabling | Enabled | Paused | Blocked`。
- 活动会话：`NoBreak | Due | Active | Finished`；结果为 `Completed | Skipped | Expired`。
- 提醒能力：`Unknown | Unsupported | RequiresApproval | Supported | Degraded`。
- 抑制状态：`NoPause | PauseThroughLocal` 与 `NoSkip | SkipReminder`。
- 结果：`Ok | Err`；领域错误统一为 `DomainError`。

## 错误

错误代码集中在 `errors.js`。预期失败必须返回 `Err(DomainError)`，不得依赖异常完成正常控制流。唯一的 throw 场景是 `defaultScheduleSettings` 引导期常量错误（程序员错误，非用户输入）。
