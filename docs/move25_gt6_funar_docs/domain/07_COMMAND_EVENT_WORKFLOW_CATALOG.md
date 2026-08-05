# 命令、事件与工作流目录

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 工作流总式

```text
Input Adapter
  -> Parse/Validate
  -> Load Facts through Ports
  -> Pure Decide
  -> Interpret Effects
  -> Persist/Observe Results
  -> Reconcile if needed
  -> Render Model
```

## 2. ConfigureSchedule

**输入**：原始星期、工作块、节律。  
**纯步骤**：解析值 → 累积验证错误 → 规范化工作块 → 生成 `ScheduleConfigured`。  
**效果**：保存快照；如已启用，触发 `ReconcilePlan`。  
**错误**：无工作日、时间块重叠、非法分钟、持续时间越界。

## 3. EnablePlan

1. 读取能力快照；
2. 若不是 `Supported`，返回 `CAPABILITY_NOT_CONFIRMED`；
3. 产生 `PlanEnabled`；
4. 保存状态；
5. 计算有限调度窗口；
6. 对账系统提醒。

启用不是 UI 布尔值切换，而是一个需要能力前置条件的领域命令。

## 4. ReconcilePlan

输入：设置、暂停/跳过状态、当前日期范围、系统能力、已注册集合。  
输出：

```text
PlanDiff = {
  toRegister: ReminderIntent[],
  toCancel: SemanticKey[],
  unchanged: SemanticKey[]
}
```

对账函数必须满足幂等性：同一输入重复执行，第二次差异为空。

## 5. HandleReminderFired

- 通过语义键识别提醒；
- 验证它仍属于当前期望计划；
- 过期或已被暂停的回调只记录诊断，不启动活动会话；
- 有效回调产生 `BreakBecameDue` 和震动/导航效果；
- 不直接把系统通知对象写入领域状态。

## 6. StartBreak

- 从 `Due` 转为 `Active`；
- `endsAt = startedAt + breakDuration`；
- 选择确定性的指导内容；
- 持久化活动会话；
- 若能力支持一次性结束提醒，产生注册效果；
- UI 每次激活根据 `endsAt - now` 显示剩余时间。

## 7. PauseUntil / SkipNext

- 暂停以绝对时间表达；
- 跳过以目标语义键表达，不能只保存布尔值；
- 两者变化后重新生成期望计划并对账；
- 过去的暂停和跳过标记在演化时清理。

## 8. 效果解释顺序

首选顺序：

1. 保存新的领域快照；
2. 执行外部效果；
3. 保存外部结果摘要；
4. 如中途崩溃，下次启动依靠对账恢复。

系统提醒注册和本地存储无法形成真正原子事务，因此架构以幂等语义键和最终对账保证一致性。
