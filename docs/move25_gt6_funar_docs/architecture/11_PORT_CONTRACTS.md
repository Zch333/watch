# 端口契约

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 契约原则

端口定义业务需要的最小语义，不复制平台 API 的形状。每个端口必须说明：输入、输出、幂等性、错误、时序、容量和证据等级。

## 2. `ClockPort`

```text
now() -> Result<ClockError, Instant>
```

- 必须单调地反映当前墙上时间，但领域不假设连续调用严格递增；
- 测试适配器可固定时间；
- 不在核心直接使用 `Date.now()`。

## 3. `CalendarPort`

```text
utcOffset(instant) -> Result<CalendarError, utcOffsetMinutes>
localWall(instant, utcOffsetMinutes) -> Result<CalendarError, LocalWallTime>
resolve(localDate, minuteOfDay) -> Result<CalendarError, Instant>
```

- `LocalWallTime = { localDate: LocalDate, minuteOfDay: MinuteOfDay }`；
- `resolve` 把"本地日历时间"逐条换算为绝对 `Instant`——跨 DST 边界时每个未来日期单独解析（不能用单一当前偏移）；
- 处理时区、非法本地时间和系统时间变化。领域只见值，不见平台。

## 4. `SettingsStorePort`

```text
loadSnapshot() -> Result<StoreError, Option<Snapshot>>
saveSnapshot(expectedRevision, snapshot) -> Result<StoreError, Revision>
```

- 使用版本号防止旧页面覆盖新状态；
- 保存必须是完整快照或可验证的原子替换；
- 适配器负责序列化，领域不接触 JSON 字符串。

## 5. `ReminderSchedulerPort/v2`

```text
probeCapabilities() -> Result<ReminderError, ReminderCapability>
listRegistered(namespace) -> Result<ReminderError, RegisteredReminder[]>
register(request) -> Result<ReminderError, RegistrationReport>
cancel(keys) -> Result<ReminderError, CancellationReport>
```

`register(request)`，`request = { intents, recurrenceRules, ruleExceptions, now, expandDays }`：

- **一次性模式**（`recurrenceRules` 为空）：每个意图按语义键幂等注册，按意图绝对 `dueAt` 调度；`ruleExceptions` 忽略。
- **规则模式**（`recurrenceRules` 非空）：每个周规则 **一个系统注册**，以规则的稳定 `ruleKey` 为身份（如 `recurrence:25-5:565:Mon+Tue+Wed+Thu+Fri`）；**不得**按具体日期逐个注册。同 ruleKey 重注册幂等且系统 ID 稳定；**规则集整组替换**——不在新集合内的旧规则必须被移除（重配置不得泄漏过期周规则）；声明 `supportsRecurring` 的适配器不得静默忽略规则并报成功。
- `ruleExceptions: [{ ruleKey, occurrenceDate, action: 'skip'|'pause' }]`：发生次级抑制。适配器对该规则的该日期不得触发、不得出现在注册视图中；每次 register 整组替换（领域总是发送当前完整抑制状态）。
- `listRegistered` 在规则模式下返回**发生次视图**：规则在 `expandDays` 窗口内物化的具体意图（按日经日历逐条解析——周规则以本地日历时间为准，DST 不搬移；仅未来；应用例外）。
- **回调映射**：规则触发时，适配器以具体语义键上报 `break-start:<rhythmVersion>:<YYYY-MM-DD>:<minuteOfDay>`（取发生日的本地日历日期）。领域按规则模板 + 当前抑制校验回调有效性。
- `cancel(keys)` 接受当前注册身份：一次性模式为语义键，规则模式为 ruleKey；规则模式下取消具体发生键报 missing（发生次不单独注册）。
- 结算按注册主体对齐：`RegistrationReport.failed` 在一次性模式携带 `key`、规则模式携带 `ruleKey`（Partial 按规则数判定）。
- 部分成功必须逐项报告；返回系统 ID 与身份映射。
- 不保证能力的字段必须返回 `Unknown`，不能猜测；适配器不得通过 JavaScript 长计时器实现。

## 6. `HapticsPort`

```text
vibrate(pattern) -> Result<HapticsError, Unit>
```

模式只使用领域语义：`BreakStart`, `BreakEnd`, `Error`。适配器映射到设备支持的具体形式。

## 7. `DiagnosticPort`

```text
append(entry) -> Result<DiagnosticError, Unit>
readRecent(limit) -> Result<DiagnosticError, Entry[]>
```

诊断不得包含健康数据、账号或无关个人信息。

## 8. 契约版本

每个端口有显式版本，例如 `ReminderSchedulerPort/v2`。适配器升级时，优先保持端口不变；确需改变语义时新增版本并记录 ADR。`ReminderSchedulerPort/v1`（`register({ intents, recurrenceRules })`，按意图注册）已被 v2 取代；一次性模式语义与 v1 兼容。
