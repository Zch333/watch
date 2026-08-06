# Move25 for HUAWEI WATCH GT 6 代码审阅报告

## 一、审阅结论

### 1. 总体判断

该项目的**架构方向明显高于普通原型项目**：

- 领域核心与平台副作用分离；
- 使用 Ports & Adapters 隔离时钟、日历、存储、提醒、振动和导航；
- 采用 `decide → effect → settle → evolve → persist` 的函数式工作流；
- 对提醒能力使用显式门禁，而不是在平台能力未经验证时伪装“已支持”；
- 使用语义键、绝对时间和乐观并发控制处理提醒对账；
- 已建立较完整的宿主测试、端口契约测试和架构适应度测试。

项目产品文档明确要求：25/5 节律、本地运行、低功耗、无需联网、不依赖手机端应用，并且只有在系统能力真实可用时才能向用户显示“已启用”。

但是，当前版本仍属于**架构验证阶段，而非可发布产品**。主要原因不是领域建模薄弱，而是应用壳层存在几个会破坏状态一致性的缺陷，且真实设备适配器尚未接入。

### 2. 发布判定

| 维度 | 结论 |
|---|---|
| 领域模型 | 较成熟 |
| 架构可测试性 | 良好 |
| 宿主测试覆盖 | 较好，但本次未独立执行 |
| UI 完整性 | 原型可用，存在状态和自定义设置问题 |
| 持久化一致性 | 存在 P0 缺陷 |
| 提醒注册一致性 | 存在 P0 缺陷 |
| 时区与 DST | 设计未完整闭环 |
| 真机适配器 | 尚未实现 |
| 发布准备度 | **不具备发布条件** |

---

# 二、具体需求

## 2.1 功能需求

### FR-01 工作节律配置

用户可以配置：

- 启用的星期；
- 一个或多个工作时间段；
- 专注时长；
- 活动时长；
- 是否启用提醒计划。

默认值为：

- 周一至周五；
- 09:00–12:00、13:30–18:00；
- 专注 25 分钟；
- 活动 5 分钟。

### FR-02 提醒计划管理

系统应支持：

- 启用计划；
- 关闭计划；
- 暂停一小时；
- 暂停到当天结束；
- 跳过下一次活动；
- 设置变更后的提醒重新对账；
- 应用重启后的提醒恢复和清理。

### FR-03 活动会话

用户能够：

- 从提醒页开始活动；
- 从首页立即开始活动；
- 跳过活动；
- 完成活动；
- 查看可见页面倒计时；
- 接收活动开始和结束的振动反馈。

### FR-04 系统提醒一致性

系统提醒必须：

- 使用稳定语义键；
- 重复注册时不产生重复系统提醒；
- 时区或时间变化后能够重新调度；
- 注册、取消和查询失败时明确报告；
- 不使用长时间 JavaScript 定时器冒充后台提醒。

### FR-05 状态持久化

需要持久化：

- 用户设置；
- 计划生命周期；
- 暂停和跳过状态；
- 当前活动会话；
- 能力探测结果；
- 指导动作轮换索引；
- 修订版本号。

### FR-06 能力门禁

当提醒能力为以下状态时：

- `Unknown`
- `Unsupported`
- `RequiresApproval`
- `Degraded`

应用不得无条件宣称可靠后台提醒已经启用。

### FR-07 诊断能力

诊断页面应显示：

- 当前计划状态；
- 当前提醒能力；
- 已注册提醒数量；
- 存储修订号；
- 最新诊断事件。

---

## 2.2 非功能需求

### NFR-01 可靠性

系统提醒、领域状态和持久化快照必须最终一致，不允许出现：

```text
UI 显示已关闭
但系统提醒仍在触发
```

或者：

```text
内存状态已更新
但存储仍是旧状态
且后续所有保存都发生并发冲突
```

### NFR-02 低功耗

- 非前台页面不运行每秒定时器；
- 长期计划交给系统调度；
- 不持续采集传感器；
- 不持续联网。

### NFR-03 可恢复性

应用重启、时间改变、时区改变或部分系统操作失败后，下一次启动必须自动对账。

### NFR-04 可测试性

- 领域逻辑在 Node 宿主环境测试；
- 平台适配器执行契约测试；
- 真机能力必须通过 GT6 测试；
- 平台假设不能只依赖模拟器。

### NFR-05 圆屏交互

- 首页只保留主要动作；
- 次要动作放入可滚动页面；
- 单次操作尽量不超过两步；
- 错误信息不能被无条件跳转掩盖。

---

# 三、需求应用场景

## 场景 A：正常工作日

1. 用户在 09:00 启用计划。
2. 系统计算 09:25、09:55 等活动提醒。
3. 09:25 系统提醒触发。
4. 用户点击“开始活动”。
5. 活动页面显示 5 分钟倒计时。
6. 活动结束后回到首页。
7. 后续提醒继续有效。

## 场景 B：应用退出后触发

1. 用户启用提醒。
2. 应用退出或手表息屏。
3. 系统代理在活动时间触发提醒。
4. 用户重新打开应用。
5. 应用读取持久化状态并与系统提醒注册表对账。

## 场景 C：修改工作时段

1. 原计划为 09:00–18:00。
2. 用户修改为 08:30–17:30。
3. 系统取消旧提醒。
4. 系统注册新提醒。
5. 如果取消失败，不得直接把新状态持久化为“已经完成”。

## 场景 D：提醒部分注册失败

1. 计划包含 10 个提醒。
2. 系统只成功注册 8 个。
3. 计划状态应保持 `Enabling` 或明确降级。
4. 下一次对账仅补注册缺失提醒。
5. UI 不得显示完整“已启用”。

## 场景 E：存储写入失败

1. 系统提醒注册已经成功。
2. 保存快照发生 I/O 错误。
3. 应用不得把候选状态当作已经提交的状态。
4. 应显示错误并在下次启动通过系统注册表重新收敛。

## 场景 F：跨夏令时边界

1. 用户周五设置未来三天提醒。
2. 周日发生 DST 切换。
3. 周日提醒的 UTC 偏移与周五不同。
4. 每一个未来本地时间必须通过日历适配器单独解析，而不能复用当前偏移量。

## 场景 G：自定义设置

1. 快照中保存了非预设的 40/8 节律。
2. 用户打开设置页。
3. 用户未修改内容，直接保存。
4. 原来的 40/8 必须保持不变，不能被静默替换成 25/5。

---

# 四、现有设计的优点

## 4.1 函数式核心边界清楚

领域模块不直接读取平台时钟、存储或系统提醒，而是由命令处理器收集事实后调用纯 `decide`。这是正确的依赖方向。

## 4.2 提醒身份设计合理

提醒使用：

```text
语义键 + 绝对 dueAt
```

作为差异判断基础，能够识别“本地时间相同但绝对时刻已因时区变化而改变”的情况。

## 4.3 生命周期结算设计有价值

`settlePlanLifecycle` 不允许在提醒注册失败时直接保留 `PlanEnabled`，这是一个正确且重要的约束。

## 4.4 可见倒计时不承担后台正确性

活动页面中的 `setInterval` 仅在页面可见时运行，并根据绝对 `endsAt` 重新计算剩余时间。这比通过持续减一维护倒计时可靠。

## 4.5 当前产品入口没有偷偷使用内存适配器

设备组合根要求真实的时钟、日历、存储、提醒、振动和诊断适配器。如果缺失则拒绝装配，而不是在正式 HAP 中静默使用测试实现。这个门禁策略是正确的。

---

# 五、问题清单

## 5.1 P0：必须在任何 Beta 或真机验证前修复

### P0-01 持久化失败仍返回成功状态

当前命令处理流程：

1. 先执行提醒、振动和导航等副作用；
2. 演化领域状态；
3. 保存快照；
4. 保存失败时仅写诊断日志；
5. 仍返回：

```js
{
    tag: 'Ok',
    state: evolved.value
}
```

这意味着：

```text
内存 revision = 12
存储 revision = 11
```

下一次保存会使用 `expectedRevision = 12`，而存储当前仍是 11，随后可能持续返回 `CONCURRENT_MODIFICATION`。

更严重的是，系统提醒可能已经注册或取消，而持久化状态没有同步更新。当前实现可在单次故障后形成三套不同事实：

- 系统提醒注册表；
- 内存领域状态；
- 持久化快照。

问题位于 `app/command-handler.js` 的副作用执行及持久化段。

`refresh()` 中也存在同类问题：代码先把全局 `state` 替换成归约后的状态，再执行保存；保存失败后不会回滚。

**影响：**

- 后续设置无法保存；
- 应用重启后状态倒退；
- 已完成活动可能重新显示为进行中；
- 暂停状态可能在重启后恢复；
- 提醒注册状态无法可靠对账。

**结论：P0。**

---

### P0-02 取消提醒失败仍可持久化为“已关闭”

`DisablePlan` 产生：

```text
PlanDisabled event
CancelReminders effect
```

命令处理器即使收到 `CancelReminders = Err`，仍继续演化 `PlanDisabled` 并保存。

结果可能是：

```text
领域和 UI：Disabled
系统：仍有提醒
```

之后再次点击关闭时，`DisablePlan` 在状态已经为 `Disabled` 时直接返回空决策，失去重试清理孤儿提醒的机会。相关逻辑分别位于命令处理器和 `DisablePlan` 分支。 

**结论：P0。**

---

### P0-03 启动后没有自动执行完整提醒对账

宿主工作流测试明确通过以下流程恢复重启状态：

```js
state2 = boot(app2);
state2 = run(app2, state2, reconcilePlan()).state;
```

也就是说，仅 `boot()` 不足以完成：

- 过期活动归约；
- 过期暂停恢复；
- 系统提醒注册表对账。



但实际首页 `onShow()` 只调用 `refresh()`，没有发送 `AppOpened` 或 `ReconcilePlan`。

`bootApp()` 只读取快照和探测能力，也没有执行启动对账。

这会导致：

- 应用重启后系统注册表与期望计划长期不一致；
- 时区变化后旧提醒不能立即清理；
- 存储失败留下的外部副作用不能自动收敛。

**结论：P0。**

---

### P0-04 递归提醒规则在解释器中被丢弃

领域效果 `RegisterReminders` 支持携带：

```js
{
    intents,
    recurrenceRules
}
```



策略层也会构建 `RecurrenceRule`。

但效果解释器实际只调用：

```js
ports.reminders.register(effect.intents);
```

完全没有传递 `effect.recurrenceRules`。

因此当前所谓 `RecurringCalendarStrategy` 只是死数据，真实适配器无法得知递归规则。

**结论：P0，若目标平台依赖递归注册。**

---

### P0-05 当前 HAP 无法装配核心应用

设备入口只传入：

```js
{
    navigation: createRouterAdapter()
}
```



而设备组合根强制要求：

- clock
- calendar
- store
- reminders
- haptics
- diagnostics

因此当前产品路径必然进入 `ADAPTERS_NOT_CONFIRMED`，核心功能无法运行。这符合当前能力门禁策略，但意味着仓库当前不能视为可运行产品。

**结论：发布阻断项，不一定是代码错误。**

---

## 5.2 P1：进入设备集成前应修复

### P1-01 未来提醒使用单一当前 UTC 偏移，不能正确跨越 DST

`CalendarPort` 已定义：

```text
resolve(localDate, minuteOfDay)
```

并明确指出 DST 应由适配器处理。

但当前命令处理器只获取一次当前 UTC offset，并将同一个偏移量用于整个三天计划。

领域中的 `attachDueAt` 随后通过：

```js
localToInstant(intent.localDate, intent.at, utcOffsetMinutes)
```

解析所有未来提醒。

当未来日期跨越 DST 边界时，这个算法会产生错误的绝对时间。

**建议：**

领域只生成本地意图；应用层逐条调用：

```js
calendar.resolve(intent.localDate, intent.at)
```

再把解析后的绝对时间作为事实送回纯差异计算。

---

### P1-02 快照所谓“严格解码”仍信任可伪造的 tag

当前逻辑遇到：

```js
raw.settings.tag === 'ScheduleSettings'
```

时会直接信任整个对象，而不是重新通过智能构造器验证。

同样存在：

- `revision` 只检查是不是 number，没有检查整数、非负和有限；
- `guidanceIndex` 可为负数、浮点数或无限值；
- `Active.sessionId` 未验证；
- `endsAt` 未验证必须晚于 `startedAt`；
- `PauseThroughLocal.localDate` 没有通过 `localDate()` 重建；
- `WorkBlock`、`Weekday`、`Rhythm` 主要依赖 tag，而 tag 可以来自任意 JSON。

  

这可能导致损坏快照通过启动阶段，却在计划生成或 UI 投影时抛出异常。

---

### P1-03 延迟提醒容忍策略与计划对账相冲突

提醒回调允许最多晚到 15 分钟。

但期望计划构建会删除：

```js
intent.at.value <= 当前分钟
```

的提醒。

例如：

```text
提醒计划：10:25
实际回调：10:28
用户在 10:26 打开应用触发对账
```

对账可能先把 10:25 的提醒认定为过去并取消，而回调策略又认为 10:28 仍是合法延迟。

**建议：**

在 `dueAt + LATE_TOLERANCE_MS` 之前保留尚未确认完成的提醒，而不是仅按本地分钟判断是否已过期。

---

### P1-04 `firedAt` 没有完整值验证

命令处理器验证了 `facts.now`，但 `HandleReminderFired` 会优先使用：

```js
command.firedAt || facts.now
```

并直接访问 `epochMilliseconds`。

如果平台适配器传入结构错误但 truthy 的 `firedAt`：

- 时间差可能变成 `NaN`；
- 早到和晚到检查全部失效；
- 无效对象可能被保存为 `dueAt`。

应对 `command.firedAt` 使用和系统时钟相同的 `Instant` 验证。

---

### P1-05 `StartBreak` 没有校验传入提醒键是否匹配当前 Due 会话

当前只检查：

```js
state.breakSession.tag === 'Due'
```

但不比较：

```text
command.reminderKey
state.breakSession.reminderKey
```

旧页面、重复点击或延迟 UI 事件可能使用陈旧 key 开始另一个提醒对应的活动。

---

### P1-06 递归策略先截断具体日期，再生成星期规则

`RecurringCalendarStrategy` 当前对具体计划执行：

```js
plan.slice(0, capacity)
```

随后才构建星期递归规则。

如果 capacity 较小，截断可能只保留周一至周三的数据，最终生成的递归规则会漏掉周四和周五。

应先构建规则，再按“规则数量”检查平台容量。

---

### P1-07 路由适配器无异常边界

当前代码直接调用：

```js
router.replace({ uri });
return ok(Unit);
```

如果平台调用同步抛错，异常会穿透效果解释器；如果平台调用异步失败，适配器仍立即报告成功。

至少应增加同步异常捕获；如果真实 API 依赖回调或 Promise，则端口契约需要升级为异步结果。

---

## 5.3 前端问题

### P1-08 活动页面复用时 `elapsedDispatched` 不会复位

该字段只在页面对象初始化时设为 `false`：

```js
elapsedDispatched: false
```

`onShow()` 没有重置。如果 Lite 页面实例被复用，第一次活动到期后字段会保持 `true`，第二次活动结束时不再发送 `BreakElapsed`。

---

### P1-09 非预设设置会被静默覆盖

`matchBlockIndex()` 和 `matchRhythmIndex()` 找不到匹配项时都返回 `0`。

因此，假设快照中已有：

```text
工作时间：10:00–16:00
节律：40/8
```

打开设置页后，即使不修改，保存时也会被替换成：

```text
第一组工作时段
25/5
```

这与代码注释中“打开后不修改直接保存不会改变计划”的声明不一致。

---

### P1-10 页面无论命令成功与否都直接跳走

设置页：

```js
dispatch(SettingsSaved);
navigateTo('home');
```

更多页面中的暂停、跳过操作也采用相同模式。

即使：

- 存储失败；
- 取消提醒失败；
- 注册提醒失败；

页面仍返回首页，用户很难判断操作是否生效。

---

### P1-11 诊断页面显示的不是最新八条事件

内存诊断端口的 `readRecent()` 返回**最新优先**顺序。

诊断页面却从数组尾部向前遍历。

当有 12 条记录时，页面显示的是第 12 至第 5 条，反而漏掉最新四条。

---

### P2-01 Due 页面和 Active 页面可能显示不同动作建议

Due 状态固定显示 `guidanceAt(0)`，而真正开始活动时，会按 `state.guidanceIndex` 选择下一组指导。 

用户可能在提醒页看到“站立行走”，点击开始后却变成另一组动作。

---

### P2-02 README 与当前代码不一致

README 仍包含：

- 103 个测试；
- `com.example.watch`；
- `pages/index` 临时入口；
- 部分过期阶段说明。



当前配置已改为：

```json
"bundleName": "com.move25.watch"
```

并删除 `pages/index`。

最新提交信息则声明 156 个宿主测试。

---

### P2-03 发布元数据仍是占位值

当前配置仍为：

```json
"vendor": "example"
```

同时根构建配置没有正式签名配置。 

这在开发阶段可以接受，但必须列入发布门禁。

---

# 六、后端具体修改代码

> 本项目没有传统服务器端。以下“后端”指领域层、应用层、效果解释器和平台端口。

## 6.1 修复持久化失败仍返回成功

修改 `app/command-handler.js` 的副作用执行和保存部分：

```js
/**
 * 构造失败结果。
 * 失败时始终返回操作前的 committedState，
 * 禁止把未持久化的候选状态暴露给 UI。
 */
function commandFailed(error, committedState, decision, results, facts, candidateState) {
    return Object.freeze({
        tag: 'Err',
        error: error,
        state: committedState,       // 已经确认提交的状态
        candidateState: candidateState, // 仅用于诊断，不能成为全局状态
        decision: decision,
        results: results,
        facts: facts
    });
}

// 1. 执行业务副作用。
const results = [];
let registration;

for (let index = 0; index < decision.effects.length; index += 1) {
    const effect = decision.effects[index];
    const result = interpretEffect(effect, ports);

    results.push(Object.freeze({
        effectTag: effect.tag,
        result: result
    }));

    if (effect.tag === 'RegisterReminders') {
        // 注册失败由 settlePlanLifecycle 转换成
        // Enabling 或 Blocked，不能在这里直接退出。
        registration = toRegistrationOutcome(result, effect.intents);
    }

    if (result.tag === 'Err') {
        ports.diagnostics.append(Object.freeze({
            tag: 'EffectFailed',
            effect: effect.tag,
            code: result.error.code,
            at: now
        }));

        if (effect.tag === 'CancelReminders') {
            // 取消失败时不能继续演化 PlanDisabled，
            // 否则 UI 会显示关闭但系统提醒仍存在。
            return commandFailed(
                result.error,
                currentState,
                decision,
                results,
                facts
            );
        }
    }
}

// 2. 根据注册结果结算生命周期。
const settled = settlePlanLifecycle(
    currentState,
    decision.events,
    registration
);

if (settled.tag === 'Err') {
    return commandFailed(
        settled.error,
        currentState,
        decision,
        results,
        facts
    );
}

// 3. 生成候选状态。
const evolved = evolveAll(currentState, settled.value);

if (evolved.tag === 'Err') {
    return commandFailed(
        evolved.error,
        currentState,
        decision,
        results,
        facts
    );
}

const candidateState = evolved.value;

// 4. 提交候选状态。
if (settled.value.length > 0) {
    const persist = ports.store.saveSnapshot(
        currentState.revision,
        createSnapshot(candidateState)
    );

    results.push(Object.freeze({
        effectTag: 'PersistSnapshot',
        result: persist
    }));

    if (persist.tag === 'Err') {
        ports.diagnostics.append(Object.freeze({
            tag: 'EffectFailed',
            effect: 'PersistSnapshot',
            code: persist.error.code,
            at: now
        }));

        // 保存失败时返回旧状态。
        // 已执行的系统副作用由下一次 reconcile 根据
        // listRegistered() 自动收敛。
        return commandFailed(
            persist.error,
            currentState,
            decision,
            results,
            facts,
            candidateState
        );
    }
}

// 只有副作用结算和持久化都达到允许状态后，才返回 Ok。
return Object.freeze({
    tag: 'Ok',
    state: candidateState,
    decision: decision,
    appliedEvents: settled.value,
    results: results,
    facts: facts
});
```

### 同时修复 `refresh()`

```js
const baseRevision = state.revision;
const reduced = reduceTemporalState(state, clockResult.value);

if (reduced.tag === 'Ok' && reduced.value !== state) {
    const candidateState = reduced.value;

    const persist = app.ports.store.saveSnapshot(
        baseRevision,
        createSnapshot(candidateState)
    );

    if (persist.tag === 'Ok') {
        // 只有保存成功才替换全局状态。
        state = candidateState;
    } else {
        app.ports.diagnostics.append(Object.freeze({
            tag: 'EffectFailed',
            effect: 'PersistSnapshot',
            code: persist.error.code,
            at: clockResult.value
        }));

        // 保留旧 revision，避免后续保存永久冲突。
        model = Object.freeze(Object.assign({}, model, {
            errors: Object.freeze(model.errors.concat([{
                text: '状态保存失败，请重新打开应用',
                code: persist.error.code
            }]))
        }));
    }
}
```

---

## 6.2 允许清理 Disabled 状态下的孤儿提醒

修改 `domain/decide.js`：

```js
case 'DisablePlan': {
    const registered = factsValue.registeredPlan || emptyPlan();

    const keys = registered.map(function (intent) {
        return intent.key.value;
    });

    if (state.planLifecycle.tag === 'Disabled') {
        if (keys.length === 0) {
            // 状态和系统注册表都已经关闭，真正幂等。
            return ok(decision([], []));
        }

        // 状态虽已关闭，但系统中仍有孤儿提醒。
        // 不产生新的领域事件，只执行清理。
        return decideSnapshot(state, [], [
            cancelReminders(keys)
        ]);
    }

    return decideSnapshot(state, [
        planDisabled()
    ], [
        cancelReminders(keys)
    ]);
}
```

同时修改 `ReconcilePlan`：

```js
case 'ReconcilePlan': {
    const active =
        state.planLifecycle.tag === 'Enabled' ||
        state.planLifecycle.tag === 'Paused' ||
        state.planLifecycle.tag === 'Enabling';

    if (!active) {
        const registered = factsValue.registeredPlan || emptyPlan();

        const orphanKeys = registered.map(function (intent) {
            return intent.key.value;
        });

        if (orphanKeys.length === 0) {
            return ok(decision([], []));
        }

        // Disabled 或 Blocked 状态下，系统不应保留任何 Move25 提醒。
        return decideSnapshot(state, [], [
            cancelReminders(orphanKeys)
        ]);
    }

    return reconcileEffects(state, factsValue, []);
}
```

---

## 6.3 启动后自动对账

修改 `_app-shell.js`：

```js
import {
    observeCapability,
    reconcilePlan
} from '../domain/commands.js';

function addShellError(text, code) {
    model = Object.freeze(Object.assign({}, model, {
        errors: Object.freeze((model.errors || []).concat([{
            text: text,
            code: code
        }]))
    }));
}

function bootApp(instance) {
    const bootResult = instance.boot();

    if (bootResult.tag === 'Err') {
        addShellError(
            '快照损坏或无法读取',
            bootResult.error.code
        );
        return null;
    }

    // 先建立已持久化状态。
    state = bootResult.state;

    const probe = instance.probeCapabilities();

    if (probe.tag === 'Ok') {
        const observed = instance.handleCommand(
            state,
            observeCapability(probe.value)
        );

        if (observed.tag === 'Ok') {
            state = observed.state;
        } else {
            addShellError(
                '能力状态保存失败',
                observed.error.code
            );
        }
    } else {
        // 探针失败必须可见，但不能阻止读取已有状态。
        addShellError(
            '提醒能力探测失败',
            probe.error && probe.error.code
        );
    }

    // 启动后必须进行一次系统注册表对账。
    // 这一步负责：
    // 1. 清理孤儿提醒；
    // 2. 补注册缺失提醒；
    // 3. 修正时区或时间变化；
    // 4. 完成 Enabling 状态。
    const reconciled = instance.handleCommand(
        state,
        reconcilePlan()
    );

    if (reconciled.tag === 'Ok') {
        state = reconciled.state;
        model = projectModel(
            state,
            reconciled.facts,
            model.errors
        );
    } else {
        addShellError(
            '启动对账失败',
            reconciled.error && reconciled.error.code
        );
    }

    return state;
}
```

---

## 6.4 修复递归规则丢失

建议把提醒端口升级为请求对象，而不是继续增加位置参数。

### `ports/reminder-port.js`

```js
/**
 * register(request)
 *
 * request:
 * {
 *   intents: ReminderIntent[],
 *   recurrenceRules: RecurrenceRule[]
 * }
 *
 * recurrenceRules 为空时表示一次性绝对时间注册。
 * 非空时适配器必须明确支持递归注册，
 * 不能静默忽略规则后返回成功。
 */
```

### `app/effect-interpreter.js`

```js
case 'RegisterReminders':
    return ports.reminders.register(Object.freeze({
        intents: effect.intents,

        // 规则必须传入适配器，不能在解释器中丢弃。
        recurrenceRules: effect.recurrenceRules ||
            Object.freeze([])
    }));
```

### `adapters/memory/recording-reminder.js`

```js
register(request) {
    const input = Array.isArray(request)
        // 临时向后兼容旧测试。
        ? { intents: request, recurrenceRules: [] }
        : request;

    const intents = input && Array.isArray(input.intents)
        ? input.intents
        : [];

    const recurrenceRules =
        input && Array.isArray(input.recurrenceRules)
            ? input.recurrenceRules
            : [];

    // 测试适配器记录规则，供契约测试断言。
    lastRecurrenceRules = recurrenceRules.slice();

    // 后续保持原来的注册逻辑。
}
```

### 策略层修正

```js
if (strategy.tag === 'RecurringCalendarStrategy') {
    // 不要先按具体日期截断。
    // 应由 buildRecurrenceRules 先折叠成周规则。
    return Object.freeze(plan.slice());
}
```

随后在生成规则后检查：

```js
const rules = buildRecurrenceRules(desired);

if (
    strategy.tag === 'RecurringCalendarStrategy' &&
    rules.length > strategy.maxPendingCount
) {
    return err(domainError(
        ERROR_CODES.REMINDER_CAPACITY_EXCEEDED,
        Object.freeze({
            ruleCount: rules.length,
            capacity: strategy.maxPendingCount
        })
    ));
}
```

---

## 6.5 严格重建存储设置

不要因为对象自称 `ScheduleSettings` 就直接信任它。

```js
import { parseScheduleInput } from './settings.js';

function decodeStoredSettings(raw) {
    if (
        !raw ||
        raw.tag !== 'ScheduleSettings' ||
        !Array.isArray(raw.weekdays) ||
        !Array.isArray(raw.workBlocks) ||
        !raw.rhythm
    ) {
        return invalidSnapshot(
            'invalid_schedule_settings_shape',
            raw
        );
    }

    // 把存储结构降为原始值，
    // 再通过正式智能构造器完整重建。
    return parseScheduleInput({
        enabledFlag: raw.enabledFlag === true,

        weekdays: raw.weekdays.map(function (day) {
            return day && day.value;
        }),

        workBlocks: raw.workBlocks.map(function (block) {
            return {
                start: block && block.start &&
                    block.start.value,
                end: block && block.end &&
                    block.end.value
            };
        }),

        focusMinutes:
            raw.rhythm.focusMinutes &&
            raw.rhythm.focusMinutes.value,

        breakMinutes:
            raw.rhythm.breakMinutes &&
            raw.rhythm.breakMinutes.value,

        version:
            raw.version && raw.version.value
    });
}
```

替换原逻辑：

```js
const settingsResult = decodeStoredSettings(raw.settings);

if (settingsResult.tag === 'Err') {
    return settingsResult;
}

const settings = settingsResult.value;
```

增加整数验证：

```js
function isNonNegativeInteger(value) {
    return Number.isFinite(value) &&
        Math.floor(value) === value &&
        value >= 0;
}

if (!isNonNegativeInteger(raw.revision)) {
    return invalidSnapshot(
        'invalid_revision',
        raw.revision
    );
}

if (!isNonNegativeInteger(raw.guidanceIndex)) {
    return invalidSnapshot(
        'invalid_guidance_index',
        raw.guidanceIndex
    );
}
```

活动会话还应增加：

```js
if (
    typeof raw.sessionId !== 'string' ||
    raw.sessionId.length === 0 ||
    raw.endsAt.epochMilliseconds <=
        raw.startedAt.epochMilliseconds
) {
    return invalidSnapshot(
        'invalid_break_active_interval',
        raw
    );
}
```

---

## 6.6 校验提醒回调和提醒键

```js
case 'HandleReminderFired': {
    const firedAt = command.firedAt || factsValue.now;

    if (
        !firedAt ||
        firedAt.tag !== 'Instant' ||
        !Number.isFinite(firedAt.epochMilliseconds) ||
        Math.floor(firedAt.epochMilliseconds) !==
            firedAt.epochMilliseconds
    ) {
        return err(domainError(
            ERROR_CODES.INVALID_INSTANT,
            command.firedAt
        ));
    }

    // 后续统一使用已验证 firedAt。
}
```

`StartBreak` 增加 key 一致性：

```js
case 'StartBreak': {
    if (state.breakSession.tag !== 'Due') {
        return err(domainError(
            ERROR_CODES.INVALID_STATE_TRANSITION,
            {
                from: state.breakSession.tag,
                command: command.tag
            }
        ));
    }

    const commandKey =
        command.reminderKey &&
        command.reminderKey.value
            ? command.reminderKey.value
            : command.reminderKey;

    const expectedKey =
        state.breakSession.reminderKey.value;

    if (commandKey !== expectedKey) {
        return err(domainError(
            ERROR_CODES.INVALID_STATE_TRANSITION,
            Object.freeze({
                reason: 'REMINDER_KEY_MISMATCH',
                expected: expectedKey,
                actual: commandKey
            })
        ));
    }

    return startActiveBreak(
        state,
        factsValue,
        state.breakSession.reminderKey,
        true
    );
}
```

---

# 七、前端具体修改代码

## 7.1 活动页面每次显示时重置到期标志

```js
onShow() {
    // Lite 页面实例可能被复用。
    // 每个新的活动页面显示周期都必须允许派发一次到期事件。
    this.elapsedDispatched = false;

    this.render();
    this.startVisibleTicker();
}
```

还应在 ticker 中检查当前状态：

```js
this.timerId = setInterval(function () {
    const model = refresh();

    self.remainingText =
        formatSeconds(model.remainingSeconds);

    if (model.breakStatus !== 'Active') {
        // 状态已被其他页面或启动归约改变，立即停止定时器。
        self.stopVisibleTicker();
        return;
    }

    if (
        model.remainingSeconds === 0 &&
        !self.elapsedDispatched
    ) {
        self.elapsedDispatched = true;

        const nextModel = dispatch({
            tag: 'BreakElapsed'
        });

        self.stopVisibleTicker();

        if ((nextModel.errors || []).length === 0) {
            navigateTo('home');
        }
    }
}, 1000);
```

---

## 7.2 诊断页显示真正的最新记录

替换反向循环：

```js
const lines = [];
const entries = snapshot.entries || [];

// readRecent 已经是 newest-first。
// 从 0 开始即可得到最新八条。
const count = Math.min(entries.length, 8);

for (let index = 0; index < count; index += 1) {
    const entry = entries[index];
    let line = entry.tag;

    if (entry.code) {
        line += ' ' + entry.code;
    }

    if (entry.effect) {
        line += ' [' + entry.effect + ']';
    }

    lines.push(line);
}

this.entries = lines;
```

---

## 7.3 保留非预设设置

### 修改匹配函数

```js
function matchBlockIndex(blocks, presets) {
    const target = (blocks || []).join('|');

    for (let index = 0; index < presets.length; index += 1) {
        if (blockStrings(presets[index]).join('|') === target) {
            return index;
        }
    }

    // -1 表示当前设置是自定义值，
    // 不能擅自映射到第一个预设。
    return -1;
}

function matchRhythmIndex(focus, brk, presets) {
    for (let index = 0; index < presets.length; index += 1) {
        if (
            presets[index].focus === focus &&
            presets[index].break === brk
        ) {
            return index;
        }
    }

    return -1;
}
```

### 在 UI Model 中提供原始数字

```js
function settingsSummaryFor(settings) {
    const rawBlocks = [];

    const blocks = settings.workBlocks || [];

    for (let index = 0; index < blocks.length; index += 1) {
        rawBlocks.push(Object.freeze({
            start: blocks[index].start.value,
            end: blocks[index].end.value
        }));
    }

    return Object.freeze({
        weekdays: Object.freeze(weekdays),
        blocks: Object.freeze(blockStrings),
        rawBlocks: Object.freeze(rawBlocks),

        focusMinutes:
            settings.rhythm.focusMinutes.value,

        breakMinutes:
            settings.rhythm.breakMinutes.value
    });
}
```

### 设置页保存时保留原值

```js
data: {
    selectedBlock: -1,
    selectedRhythm: -1,

    // 保存页面打开时读取到的自定义值。
    originalBlocks: [],
    originalFocusMinutes: 25,
    originalBreakMinutes: 5,

    hasError: false,
    errorText: ''
},

restoreFromModel() {
    const model = refresh();
    const summary = model.settingsSummary || {};

    this.originalBlocks =
        (summary.rawBlocks || []).slice();

    this.originalFocusMinutes =
        summary.focusMinutes;

    this.originalBreakMinutes =
        summary.breakMinutes;

    this.selectedBlock = matchBlockIndex(
        summary.blocks,
        BLOCK_PRESETS
    );

    this.selectedRhythm = matchRhythmIndex(
        summary.focusMinutes,
        summary.breakMinutes,
        RHYTHM_PRESETS
    );

    // 只有命中预设时才高亮。
    for (
        let index = 0;
        index < BLOCK_PRESETS.length;
        index += 1
    ) {
        this['blockClass' + index] =
            index === this.selectedBlock
                ? 'on'
                : '';
    }
}
```

保存逻辑：

```js
onSave() {
    const weekdays = [];

    for (
        let index = 0;
        index < WEEKDAY_NAMES.length;
        index += 1
    ) {
        if (this.weekdayOn[index]) {
            weekdays.push(WEEKDAY_NAMES[index]);
        }
    }

    const workBlocks =
        this.selectedBlock >= 0
            ? BLOCK_PRESETS[this.selectedBlock]
            : this.originalBlocks;

    const rhythm =
        this.selectedRhythm >= 0
            ? RHYTHM_PRESETS[this.selectedRhythm]
            : {
                focus: this.originalFocusMinutes,
                break: this.originalBreakMinutes
            };

    const nextModel = dispatch({
        tag: 'SettingsSaved',
        raw: {
            enabledFlag: this.enabledFlag,
            weekdays: weekdays,
            workBlocks: workBlocks,
            focusMinutes: rhythm.focus,
            breakMinutes: rhythm.break
        }
    });

    const errors = nextModel.errors || [];

    if (errors.length === 0) {
        // 只有保存、提醒对账和持久化均成功才离开页面。
        navigateTo('home');
        return;
    }

    this.hasError = true;
    this.errorText =
        errors[errors.length - 1].text ||
        errors[errors.length - 1].code ||
        '保存失败';
}
```

---

## 7.4 修正 Due 页面指导动作

不要在 Due 状态固定使用第一组指导动作。

```js
function guidanceFor(session, guidanceIndex) {
    if (!session) {
        return null;
    }

    if (
        session.tag === 'Active' ||
        session.tag === 'Due'
    ) {
        const selectedIndex =
            session.tag === 'Active'
                ? findGuidanceIndexById(
                    session.guidanceId
                )
                : guidanceIndex;

        const item = guidanceAt(selectedIndex);

        return Object.freeze({
            id: item.id,
            actions: item.actions
        });
    }

    return null;
}
```

投影时调用：

```js
currentGuidance: guidanceFor(
    session,
    state.guidanceIndex
)
```

更严格的设计是，在 `BreakBecameDue` 时就选定并保存 `guidanceId`，保证提醒页和活动页绝对一致。

---

## 7.5 页面操作失败时不要立即跳转

更多页面可抽取：

```js
function dispatchThenHome(message) {
    const nextModel = dispatch(message);
    const errors = nextModel.errors || [];

    if (errors.length > 0) {
        // 保持当前页面，让用户看到失败状态。
        return false;
    }

    navigateTo('home');
    return true;
}

export default {
    onPauseToday() {
        dispatchThenHome({
            tag: 'PauseTodayPressed'
        });
    },

    onPauseHour() {
        dispatchThenHome({
            tag: 'PauseOneHourPressed'
        });
    },

    onSkipNext() {
        dispatchThenHome({
            tag: 'SkipNextPressed'
        });
    }
};
```

---

# 八、建议补充的测试

## 8.1 持久化失败不得推进全局状态

```js
test('workflow: persistence failure does not expose candidate revision', () => {
    const app = createHostApp(...);
    let state = boot(app);

    app.ports.store._failNextSave();

    const result = app.handleCommand(
        state,
        observeCapability(SUPPORTED)
    );

    assert.equal(result.tag, 'Err');

    // 返回状态仍是已持久化版本。
    assert.equal(result.state.revision, state.revision);

    // 存储修订也没有改变。
    assert.equal(
        app.ports.store.readStatus().value.revision,
        state.revision
    );
});
```

## 8.2 取消失败不得进入 Disabled

```js
test('workflow: cancel failure does not commit disabled state', () => {
    // 使用可注入 cancel 失败的提醒适配器。
    // 断言：
    // 1. 命令返回 Err；
    // 2. state 仍是 Enabled；
    // 3. 快照仍是 Enabled；
    // 4. 下一次 Disable 可重试。
});
```

## 8.3 启动自动对账

```js
test('shell: boot automatically reconciles expired session and registry', () => {
    // 快照中保存 Active；
    // 当前时间晚于 endsAt；
    // 初始化 shell；
    // 断言状态已经 Finished；
    // 不应要求页面手动发送 ReconcilePressed。
});
```

## 8.4 递归规则必须到达适配器

```js
test('effect interpreter forwards recurrence rules', () => {
    // 构造 RegisterReminders effect；
    // 调用 interpretEffect；
    // 断言适配器收到完整 recurrenceRules。
});
```

## 8.5 损坏 tag 不得绕过解码

```js
test('snapshot rejects spoofed ScheduleSettings tags', () => {
    const raw = {
        tag: 'Snapshot',
        schemaVersion: 1,
        revision: 0,
        settings: {
            tag: 'ScheduleSettings',
            weekdays: [
                { tag: 'Weekday', value: 'InvalidDay' }
            ]
        }
    };

    assert.equal(
        rehydrateFromRaw(raw).tag,
        'Err'
    );
});
```

## 8.6 自定义设置往返不变

```js
test('settings: opening and saving custom values is lossless', () => {
    // 初始设置 40/8 和自定义时段；
    // 执行 restoreFromModel + onSave；
    // 断言领域设置完全相同。
});
```

## 8.7 页面复用后的第二次活动仍能到期

```js
test('break-active: elapsed event resets for every visible session', () => {
    // 模拟同一页面实例 onShow -> 到期；
    // 再次 onShow -> 到期；
    // 断言 BreakElapsed 共发送两次。
});
```

## 8.8 诊断事件顺序

```js
test('diagnostics page displays newest eight entries', () => {
    // 写入 12 条；
    // 断言页面第一条是第 12 条；
    // 最后一条是第 5 条。
});
```

## 8.9 DST 边界测试

需要使用具备 DST 行为的测试日历适配器，断言同一当地时间在 DST 切换前后使用不同 UTC offset。

## 8.10 延迟回调与对账竞态

覆盖：

```text
10:25 到期
10:26 执行 Reconcile
10:28 收到系统回调
```

确保合法迟到回调不会因提前清理而消失。

---

# 九、注意点

## 9.1 不要把更多单元测试等同于真机可靠性

宿主测试能够证明：

- 日程算法；
- 状态转换；
- 端口契约；
- 错误映射；
- 快照迁移。

但不能证明：

- 息屏后是否触发；
- 进程退出后是否触发；
- 重启后是否保留；
- 手机断连后是否触发；
- 系统容量限制；
- 免打扰、低电量和省电模式行为。

## 9.2 平台适配器必须保留语义键

真实提醒适配器不能只保存系统 reminder ID。必须维护：

```text
semanticKey ↔ systemId ↔ dueAt
```

否则：

- 时区重调度；
- 幂等注册；
- 取消；
- 对账；

都无法正确实现。

## 9.3 系统副作用不能假定事务性

存储、提醒注册和提醒取消不属于同一个事务，因此应用必须设计为：

```text
尝试执行
→ 记录结果
→ 持久化
→ 失败后自动对账
→ 最终收敛
```

如果平台故障率较高，建议进一步引入轻量持久化操作日志：

```text
PendingOperation
AppliedOperation
CommittedState
```

这相当于设备端简化版 outbox，而不是试图制造跨系统 ACID 事务。

## 9.4 不要让诊断查询改变状态

`diagnosticsSnapshot()` 当前只调用正式只读端口，这是正确方向。诊断页面不能触发提醒注册或自动修复，以免查看诊断本身改变问题现场。

## 9.5 `settlePlanLifecycle` 不应把缺少注册结果视为成功

当前：

```js
if (!registration || registration.tag === 'Registered')
```

把 `undefined` 当成注册成功。

更安全的规则应为：

```js
if (hasEnable && !registration) {
    return Err(MISSING_REGISTRATION_OUTCOME);
}
```

只有不涉及注册的命令才允许 `registration === undefined`。

---

# 十、建议实施顺序

## 第一批：修复状态一致性

1. 持久化失败返回 `Err`；
2. `refresh()` 不得保留未保存状态；
3. 取消提醒失败不得提交 Disabled；
4. Disabled 状态允许清理孤儿提醒；
5. 启动自动执行 Reconcile。

这是最优先的一批。未完成前，不建议继续扩展平台适配器。

## 第二批：修复提醒策略

1. 传递 recurrenceRules；
2. 修正递归容量计算；
3. 解决晚到提醒与对账竞态；
4. 校验 firedAt 和 reminderKey；
5. 逐条使用 CalendarPort.resolve 处理未来日期。

## 第三批：修复前端状态

1. 活动页面重置到期标志；
2. 保留自定义设置；
3. 命令失败时阻止跳转；
4. 修正诊断顺序；
5. 统一 Due 和 Active 指导内容。

## 第四批：平台接入

1. Lite Clock Adapter；
2. Lite Calendar Adapter；
3. Lite Store Adapter；
4. Reminder Adapter；
5. Haptics Adapter；
6. Persistent Diagnostics Adapter；
7. Router Adapter 异常处理。

## 第五批：发布门禁

1. DevEco debug 构建通过；
2. DevEco release 构建通过；
3. 签名配置完成；
4. vendor 和 bundle 标识最终确认；
5. 模拟器圆屏布局验证；
6. GT6 真机能力探针；
7. 三天后台提醒可靠性试验；
8. 重启、息屏、断连、低电量、免打扰测试；
9. README 与实际测试数量同步。

---

# 十一、最终评价

该仓库不是“架构混乱、需要推倒重来”的项目。相反，它已经建立了较强的领域边界、能力门禁和测试结构。

真正的问题集中在**命令提交协议和副作用一致性**：

```text
执行外部副作用
→ 演化状态
→ 保存失败
→ 仍返回成功
```

这是当前最危险的路径。

因此，最合理的策略不是继续增加页面或领域功能，而是先把以下不变量写入代码和测试：

```text
1. 未持久化的状态不得暴露为已提交状态。

2. 系统提醒取消失败时，不得宣称计划已经关闭。

3. 每次启动必须自动把系统注册表、持久化快照和领域期望计划收敛到一致状态。

4. 递归规则、时区解析和平台错误不能在适配器边界被静默丢弃。

5. 用户未修改设置时，保存操作必须保持语义完全不变。
```

完成这些修改后，该项目才适合进入真实 GT6 平台适配和能力探针阶段。