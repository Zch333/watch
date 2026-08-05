# 提醒调度代数与组合子模型

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 核心函数

```text
generateBlockPlan : LocalDate × WorkBlock × Rhythm -> ReminderPlan
generateDayPlan   : LocalDate × List<WorkBlock> × Rhythm -> ReminderPlan
generateRangePlan : DateRange × ScheduleSettings -> ReminderPlan
applySuppression  : ReminderPlan × Pause × Skip -> ReminderPlan
diffPlans         : DesiredPlan × RegisteredPlan -> PlanDiff
```

这些函数均为纯函数。

## 2. 工作块算法

```text
cycle = focus + break
cycleStart = block.start
while cycleStart + focus <= block.end:
    emit BreakStart(cycleStart + focus)
    cycleStart = cycleStart + cycle
```

使用分钟代数完成本地日程推导，不在循环中读取系统时间。

## 3. `ReminderPlan` 的组合

定义：

```text
emptyPlan = []
combine(a, b) = sortByTime(uniqueBySemanticKey(a ++ b))
```

它满足工程上需要的性质：

- 结合律：工作块组合顺序不影响最终计划；
- 单位元：与空计划组合不改变结果；
- 幂等去重：同一计划重复组合不产生重复提醒。

因此上午、下午、每日和每周计划可以使用同一个组合器逐级构建。这里使用代数是为了降低规则复杂度，不是为了追求术语。

## 4. 语义键

建议格式：

```text
break-start:<scheduleVersion>:<localDate>:<minuteOfDay>
break-end:<sessionId>
```

语义键用于：

- 防重复注册；
- 系统回调映射；
- 跳过下一次；
- 计划差异计算；
- 诊断。

不得以系统返回的临时 reminderId 作为唯一领域身份；系统 ID 只存于适配器映射。

## 5. 能力驱动的计划策略

```text
chooseSchedulingStrategy(capability, desiredPlan) -> Result<StrategyError, RegistrationStrategy>
```

可能策略：

- `RecurringCalendarStrategy`：平台明确支持按星期重复；
- `RollingWindowStrategy(days)`：按最大待处理数量选择 1–N 天窗口；
- `SingleNextStrategy`：只有系统保证回调执行和续链可靠时才允许；
- `UnsupportedStrategy`：拒绝启用可靠模式。

标准 HarmonyOS 代理提醒文档提到普通应用的有效未过期提醒数量上限为 30，但该限制不能直接套用到 GT6 Lite；能力探针必须记录实际限制。[H5]

## 6. 性质测试

- 生成点严格递增；
- 所有点都位于工作块内；
- 相邻点间隔等于完整周期；
- 组合满足结合律和单位元；
- `diffPlans(p, p)` 为空；
- 对 `diff` 应用后再次对账为空；
- 暂停和跳过只删除，不新增提醒。
