# 函数式领域模型

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 建模策略

Lite Wearable 使用 JavaScript，因此不能依赖编译器提供完整代数数据类型。架构文档先用代数形式表达，再用带 `tag` 的不可变记录和智能构造器实现。

## 2. 基础值类型

```text
MinuteOfDay      = integer where 0 <= value < 1440
PositiveMinutes  = integer where 1 <= value <= configuredLimit
LocalDate        = { year, month, day }
Weekday          = Mon | Tue | Wed | Thu | Fri | Sat | Sun
Instant          = epoch milliseconds
SemanticKey      = non-empty string
```

每个值必须由智能构造器创建：

```javascript
function ok(value) { return { tag: 'Ok', value: value }; }
function err(code, details) { return { tag: 'Err', error: { code: code, details: details } }; }

function minuteOfDay(value) {
  if (typeof value !== 'number' || value % 1 !== 0 || value < 0 || value >= 1440) {
    return err('INVALID_MINUTE_OF_DAY', value);
  }
  return ok({ tag: 'MinuteOfDay', value: value });
}
```

构造完成的领域值按不可变约定使用；不得原地修改。

## 3. 复合数据

```text
Rhythm = {
  focusMinutes: PositiveMinutes,
  breakMinutes: PositiveMinutes
}

WorkBlock = {
  start: MinuteOfDay,
  end: MinuteOfDay
}

ScheduleSettings = {
  enabled: Boolean,
  weekdays: Set<Weekday>,
  workBlocks: List<WorkBlock>,
  rhythm: Rhythm,
  version: SchemaVersion
}
```

## 4. 联合类型

### 能力状态

```text
ReminderCapability =
  | Unknown
  | Unsupported(reason)
  | RequiresApproval(details)
  | Supported(features)
  | Degraded(reason)
```

`features` 至少包含：

```text
maxPendingCount
supportsExactTimer
supportsCalendar
supportsRecurring
survivesAppExit
survivesPhoneDisconnect
survivesReboot
supportsActionButtons
supportsCustomSound
```

未知字段不得默认视为 `true`。

### 活动会话

```text
BreakSession =
  | NoBreak
  | Due(reminderKey, dueAt)
  | Active(sessionId, startedAt, endsAt, guidanceId)
  | Finished(sessionId, finishedAt, outcome)

Outcome = Completed | Skipped | Expired
```

### 领域结果

```text
Result<E, A> = Ok(A) | Err(E)
Option<A> = Some(A) | None
```

## 5. 命令、事件与效果

```text
Command =
  | ConfigureSchedule(input)
  | EnablePlan
  | DisablePlan
  | PauseUntil(instant)
  | SkipNext
  | StartBreak(reminderKey)
  | CompleteBreak
  | HandleReminderFired(reminderKey, firedAt)
  | ReconcilePlan(now)

Effect =
  | PersistSnapshot(snapshot)
  | QueryRegisteredReminders
  | RegisterReminders(intents)
  | CancelReminders(keys)
  | Vibrate(pattern)
  | Navigate(route)
  | EmitDiagnostic(entry)
```

## 6. 决策函数

核心形式：

```text
decide : State × Command × Facts -> Result<DomainError, Decision>
evolve : State × DomainEvent -> State
Decision = { events: List<DomainEvent>, effects: List<Effect> }
```

`Facts` 是已经由端口取得的值，例如当前时间、能力快照、已注册提醒；它不是隐式全局依赖。

## 7. 非法状态控制

动态语言中采用四层防线：

1. 所有外部输入先解析为领域值；
2. 领域模块不导出裸记录构造方式；
3. 联合值必须有受控 `tag`；
4. 入口处进行穷尽分支检查，未知 `tag` 直接形成显式错误。
