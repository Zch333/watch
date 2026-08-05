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
today(instant) -> LocalDate
weekday(localDate) -> Weekday
resolve(localDate, minuteOfDay) -> Result<TimeResolutionError, Instant>
```

处理时区、非法本地时间和系统时间变化。

## 4. `SettingsStorePort`

```text
loadSnapshot() -> Result<StoreError, Option<Snapshot>>
saveSnapshot(expectedRevision, snapshot) -> Result<StoreError, Revision>
```

- 使用版本号防止旧页面覆盖新状态；
- 保存必须是完整快照或可验证的原子替换；
- 适配器负责序列化，领域不接触 JSON 字符串。

## 5. `ReminderSchedulerPort`

```text
probeCapabilities() -> Result<ReminderError, ReminderCapability>
listRegistered(namespace) -> Result<ReminderError, RegisteredReminder[]>
register(intents) -> Result<ReminderError, RegistrationReport>
cancel(keys) -> Result<ReminderError, CancellationReport>
```

契约要求：

- 每个意图按语义键幂等；
- 部分成功必须逐项报告；
- 返回系统 ID 与语义键映射；
- 不保证能力的字段必须返回 `Unknown`，不能猜测；
- 适配器不得通过 JavaScript 长计时器实现。

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

每个端口有显式版本，例如 `ReminderSchedulerPort/v1`。适配器升级时，优先保持端口不变；确需改变语义时新增版本并记录 ADR。
