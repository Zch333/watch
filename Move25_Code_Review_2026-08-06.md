# Move25 / Zch333-watch 代码审阅报告

- 仓库：`Zch333/watch`
- 审阅分支：`master`
- 审阅基线：最新可见提交 `b31d774ebed2a36b4e60a237be6d24d4ef29d5f0`
- 审阅日期：2026-08-06
- 目标设备：HUAWEI WATCH GT 6 / Lite Wearable
- 架构基线：FUNAR × Functional DDD × Hexagonal Architecture × MVU
- 审阅方式：GitHub 静态代码审阅与华为官方公开资料交叉核对
- 限制：本报告未在本地 DevEco Studio、Lite 模拟器或 GT6 真机上编译运行，因此不会把仓库 README 中的测试状态或平台能力当作独立验证结论。

---

## 1. 执行摘要

### 1.1 总体结论

该仓库的**架构方向明显高于普通原型项目**：

- 领域规则已经从 UI 和平台 API 中分离；
- 使用不可变记录、带标签联合类型、显式 `Result`、纯 `decide/evolve`；
- 端口、内存适配器、效果解释器和 MVU 已具雏形；
- 对后台提醒能力保持审慎，没有用长 `setTimeout`/`setInterval` 冒充可靠后台能力；
- 测试覆盖意识较强，包含性质测试、状态机测试、契约测试和随机命令序列走查。

但是，当前代码仍然是**宿主可验证的架构原型，不是可在 GT6 上使用的产品**。最严重的问题是：

1. 正式入口仍装配宿主内存适配器；
2. 启动时固定时钟没有初始值，存在直接崩溃路径；
3. 系统效果失败后，状态仍可能演化成“已启用”；
4. 没有真实存储、振动、提醒或设备时间适配器；
5. 5 分钟活动倒计时不会持续刷新，也没有后台结束提醒；
6. 多数页面使用 `this.data.xxx` 写值，可能无法触发 Lite JS 页面响应式更新；
7. 首页和设置页在 466×466 圆屏上明显超出可视区域；
8. 设置页默认选择 50/10，保存时可能把领域默认 25/5 静默改掉；
9. 时区变化不会使同一语义键的提醒重新注册；
10. 签名、包名、首页和平台能力仍未完成。

### 1.2 评分

| 维度 | 评分 | 结论 |
|---|---:|---|
| 架构思想 | 8/10 | 边界与纯函数设计较成熟 |
| 领域建模 | 7.5/10 | 基本完整，但调度物化和效果结果建模不足 |
| 宿主测试设计 | 8/10 | 覆盖面较好；本报告未独立执行 |
| Lite Wearable 平台集成 | 1/10 | 真实适配器尚未实现 |
| UI 可用性 | 3/10 | 信息完整，但圆屏布局和响应式写法风险很高 |
| 低功耗设计 | 7/10 | 原则正确，关键系统调度能力尚未落地 |
| 发布就绪度 | 1/10 | 当前应判定 **No-Go** |

---

## 2. 具体需求

### 2.1 核心业务需求

Move25 应在用户设定的上班时间内，以一个完整周期运行：

```text
工作 25 分钟
→ 提醒活动
→ 活动 5 分钟
→ 下一轮工作
```

默认配置：

- 周一至周五；
- 09:00–12:00；
- 13:30–18:00；
- 工作 25 分钟；
- 活动 5 分钟。

提醒内容应覆盖：

- 起身；
- 走动；
- 温和伸展；
- 看向远处、眨眼和放松眼睛。

### 2.2 操作需求

用户至少需要：

- 启用/关闭提醒；
- 修改工作日；
- 修改工作时段；
- 修改工作/活动时长；
- 暂停一小时；
- 暂停今天；
- 跳过下一次；
- 立即开始活动；
- 提醒到点后开始或跳过活动；
- 提前完成活动；
- 查看能力和错误诊断。

### 2.3 平台需求

- 首选纯手表端独立运行；
- 日常使用不依赖 vivo、HarmonyOS 手机或 iPhone 的具体平台；
- 无网络、无账号、无云端；
- 本地保存设置和运行状态；
- 应用退出、息屏后不得依赖 JavaScript 进程持续计时；
- 系统提醒能力不可用时，必须明确显示降级状态；
- 不得静默退化为不可靠前台定时器。

### 2.4 非功能需求

- 低功耗；
- 幂等；
- 可恢复；
- 可对账；
- 错误显式；
- 平台能力可追溯；
- 领域内核可脱离设备测试；
- 466×466 圆屏可操作；
- 不提交签名材料、UDID 或个人日志。

---

## 3. 需求分析与应用场景

### 3.1 标准工作日

用户 09:00 上班，09:25 收到活动提醒，活动 5 分钟后继续工作；午休期间停止提醒；13:30 重新开始周期。

验收重点：

- 上午和下午各自从工作块起点重新计算；
- 午休不累积周期；
- 提醒时间不因应用休眠而漂移。

### 3.2 会议或临时忙碌

用户可：

- 暂停一小时；
- 暂停今天；
- 跳过下一次。

验收重点：

- 旧系统提醒被取消或失效；
- 重复点击不会产生重复提醒；
- 暂停结束后计划可重新对账。

### 3.3 手动活动

用户可以随时点“立即活动”，进入 5 分钟活动页面。

验收重点：

- 不需要伪造一个系统久坐提醒；
- 不覆盖正在进行的活动会话；
- 页面息屏后，重新打开可按绝对结束时间恢复剩余时间。

### 3.4 应用重启或系统回收

验收重点：

- 设置和状态从快照恢复；
- 已过期活动会话被归约；
- 计划与系统注册状态重新对账；
- 损坏快照明确报错，不静默丢弃。

### 3.5 时区或系统时间变化

验收重点：

- 本地工作时间仍保持 09:00、13:30 等语义；
- 绝对触发时间重新物化；
- 即使领域语义键未变化，旧系统提醒也必须更新。

### 3.6 能力受限

可能出现：

- 提醒 API 不存在；
- 需要开放能力审批；
- 只能注册少量提醒；
- 重启后不保留；
- 免打扰或低电量模式抑制震动。

验收重点：

- UI 明确显示 `Unknown / RequiresApproval / Degraded / Unsupported`；
- 不将“页面能倒计时”包装成“后台提醒可靠”；
- 诊断页记录错误码、能力特征和实验结果。

---

## 4. 当前实现中做得好的部分

### 4.1 领域核心基本保持纯净

`domain/` 主要使用：

- 不可变值；
- 显式 `Result`；
- 命令、事件和效果 ADT；
- `decide`；
- `evolve`；
- 调度代数；
- 版本化快照。

这符合 Functional Core / Imperative Shell 的方向。

### 4.2 提醒使用语义键

提醒不是以平台 ID 作为领域身份，而是使用：

```text
break-start:<rhythm>:<local-date>:<minute>
```

这为幂等注册、取消和对账提供了良好基础。

### 4.3 能力门禁是显式领域状态

已经区分：

```text
Unknown
Unsupported
RequiresApproval
Supported
Degraded
```

避免了把平台假设写死进业务。

### 4.4 没有用长 JavaScript 定时器冒充后台能力

这是正确的低功耗和可靠性原则。

### 4.5 测试思路优于普通穿戴原型

仓库声明包含：

- 计划边界；
- 性质测试；
- 状态机；
- 迁移；
- 端口契约；
- 部分失败；
- 随机命令序列模型走查；
- 架构适应度测试。

这些是值得保留的资产。

---

## 5. 审阅发现

## P0：阻止当前应用运行或产生错误产品状态

### P0-1：正式入口使用宿主组合根，而且固定时钟为 `undefined`

当前调用链：

```text
app.js
→ initApp({})
→ createHostApp({})
→ createFixedClock(opts.instant)
→ createFixedClock(undefined)
→ clock.now() 返回 Ok(undefined)
→ calendar.localWall(undefined)
→ 读取 instantValue.epochMilliseconds
```

这意味着应用启动或首次刷新时可能直接抛出运行时异常。

#### 建议

- `createHostApp` 只能用于 Node 宿主测试；
- 新增 `createDeviceApp`；
- 在平台适配器未完成前，正式 HAP 应停留在明确的 Probe 页面，而不是装配无效宿主应用；
- 所有适配器输入在边界处校验。

---

### P0-2：当前“产品页面”实际上仍运行内存假适配器

当前页面使用：

- 固定时钟；
- 内存存储；
- 记录型提醒；
- 记录型振动；
- 记录型导航。

结果是：

- 设置不会真正持久化；
- 手表不会真正震动；
- 系统不会注册提醒；
- 导航效果只写入内存；
- 诊断数字来自假适配器。

这适合测试，但不能作为产品 shell。

---

### P0-3：效果失败后仍然演化状态并返回 `Ok`

当前工作流大致为：

```text
decide
→ 逐个执行 effect
→ 即使 effect 失败也只写诊断
→ evolve 所有业务事件
→ 返回 Ok
```

例如系统提醒注册失败，但 `PlanEnabled` 事件仍会被演化，UI 可能显示“已启用”。

这是比平台 API 缺失更严重的正确性问题：**状态宣称成功，但现实副作用失败。**

#### 正确原则

```text
请求启用
→ 注册提醒
→ 注册成功后才产生 PlanEnabled
→ 注册失败产生 PlanBlocked / OperationalDegraded
→ 最后持久化最终状态
```

---

### P0-4：活动倒计时不会持续更新，也不会自然结束

活动页只在 `onShow()` 调用一次 `render()`：

- 没有可见页面刷新；
- `TickVisible` 没有被页面发送；
- 到 0 后没有 `BreakElapsed` 命令；
- 没有 5 分钟结束系统提醒；
- 用户不点击“提前完成”或“跳过”时，会话不会自然完成。

允许在页面可见期间使用短周期 UI 刷新，但它只能负责显示；后台正确性仍必须由绝对时间和系统提醒保证。

---

### P0-5：页面使用 `this.data.xxx` 更新状态，可能不会触发响应式刷新

当前多个页面写：

```js
this.data.nextBreak = ...
this.data.remainingText = ...
```

Lite JS 页面通常将 `data` 字段暴露为页面实例属性，示例写法是：

```js
this.nextBreak = ...
this.remainingText = ...
```

当前写法很可能只修改内部对象，而不触发模板绑定更新。必须在 DevEco 模拟器立即验证并统一修正。

---

### P0-6：首页和设置页明显超出 466×466 圆屏

首页含：

- 状态横幅；
- 计划状态；
- 下次提醒；
- 错误；
- 7 个 48px 按钮；
- 每个按钮还有 10px 上边距。

仅按钮就约：

```text
7 × (48 + 10) = 406px
```

再加文本和边距，必然超出屏幕。

设置页的工作日、三组工作时段、四组节律及保存按钮也没有滚动容器。

需要：

- 使用 `list/list-item`；
- 首页保留一个主操作和一个“更多”入口；
- 将设置拆页或滚动；
- 确保顶部/底部圆弧安全区域。

---

## P1：高优先级正确性问题

### P1-1：设置页默认会把 25/5 静默改成 50/10

领域默认是 25/5，但设置页：

```js
selectedRhythm: 1
```

而预设索引 1 是 50/10。

用户进入设置后直接保存，就可能把 25/5 改成 50/10。

此外，`onShow()` 只恢复 `enabledFlag`，没有恢复：

- 当前工作日；
- 当前工作时段；
- 当前工作/活动时长。

---

### P1-2：仅支持周一至周五，领域模型却支持七天

设置 UI 只有：

```text
Mon Tue Wed Thu Fri
```

如果未来领域状态包含周六或周日，打开设置并保存会丢失这两天。

---

### P1-3：时区变化不会触发同一语义键的提醒重注册

提醒 key 只包含：

- 节律；
- 本地日期；
- 本地分钟。

假设用户从 UTC+8 切换到 UTC+9：

```text
本地 09:25 的 key 不变
绝对触发时间变化一小时
```

现有 `diffPlans` 只比较 key，因此会认为“提醒未变化”，不会更新系统提醒。

#### 建议

应用层将本地意图物化为：

```js
{
  key,
  dueAt,
  fingerprint: key + '@' + dueAt.epochMilliseconds
}
```

比较时：

- key 相同、fingerprint 相同：unchanged；
- key 相同、fingerprint 不同：cancel/update + register。

---

### P1-4：读取系统提醒失败时被当成“系统没有提醒”

`listRegistered()` 失败后，命令处理器继续使用：

```js
registeredPlan = []
```

这可能造成：

- 重复注册；
- 容量耗尽；
- 状态错误；
- 把权限错误误判为“空列表”。

涉及对账的命令应在列表失败时终止或进入显式降级，不应把未知解释为空。

---

### P1-5：每个命令都查询提醒列表

即使用户只是：

- 完成活动；
- 查看页面；
- 跳过当前活动；

命令处理器仍先调用 `listRegistered()`。

这增加耗电和失败面。应按命令所需 facts 精确采集：

```text
Enable/Configure/Pause/SkipNext/Reconcile → 需要 registeredPlan
StartBreak/CompleteBreak → 不需要 registeredPlan
```

---

### P1-6：提醒回调只检查 key 存在，不检查触发时刻

如果某个未来提醒 key 被提前触发，只要它仍存在于未来几天计划中，当前代码可能接受它。

应校验：

```text
abs(actualFiredAt - expectedDueAt) <= tolerance
```

并区分：

- 准时；
- 延迟；
- 过早；
- 已过期；
- 系统补发；
- 重复回调。

---

### P1-7：快照恢复并不“严格”

当前多个未知值会静默退化：

- 未知 lifecycle → Disabled；
- 未知 break session → NoBreak；
- 未知 outcome → Completed；
- 未知 capability → Unknown。

并且只要 `settings.tag === 'ScheduleSettings'`，就直接信任内部字段，没有重新通过智能构造器验证。

这可能把损坏数据恢复成看似正常的状态，或在后续代码中崩溃。

---

### P1-8：调度策略只实现了“切片”，没有实现策略语义

`RecurringCalendarStrategy`、`RollingWindowStrategy.days` 和 `SingleNextStrategy` 已建模，但 `applyStrategyWindow` 基本只按 `maxPendingCount` 切片：

- `days` 没有用于过滤日期；
- recurring 没有生成重复规则；
- degraded strategy 没有 maxPending 时默认 30，可能违反设备容量。

策略 ADT 目前更像标签，而非真正可解释的调度程序。

---

### P1-9：NavigationPort 被绕过

已经实现 `router-adapter.js`，但：

- 首页直接导入 `@system.router`；
- 设置页直接导入；
- 诊断页直接导入；
- 产品 shell 仍装配 recording navigation。

这破坏了“平台 API 只进入适配器”的边界。

---

### P1-10：诊断页依赖内存适配器私有方法

诊断页依赖：

```text
_all()
_registeredKeys()
_peek()
```

这些不是端口契约的一部分，真实平台适配器不一定提供。

应新增正式的 `DiagnosticsQuery` 或 `RuntimeStatusPort`，返回稳定 DTO。

---

### P1-11：指导动作直接显示内部键值

当前 UI 可能显示：

```text
stand_and_walk
simple_stretch
look_far
```

而不是中文用户文案。

应在 UI 投影层做资源映射，领域只保留稳定语义 ID。

---

### P1-12：提醒到点和开始活动可能重复震动

`HandleReminderFired` 发出 `BreakStart` 震动，随后 `StartBreak` 又发出同样的 `BreakStart` 震动。

建议区分：

```text
BreakDue
BreakStarted
BreakEnded
```

或者开始活动时不再次震动。

---

## P2：发布和工程治理问题

### P2-1：产品入口仍是 Probe 页面

`config.json` 中第一个页面仍是：

```text
pages/index/index
```

正式产品入口应改为 `pages/home/index`，Probe 应独立分支或独立构建产品。

### P2-2：包名和 vendor 仍为模板值

```text
com.example.watch
example
```

应在 AGC 和签名配置前确定最终身份。

### P2-3：签名配置为空但产品引用 default

```json
"signingConfigs": [],
"signingConfig": "default"
```

真机安装前必须配置。

### P2-4：`.gitignore` 不完整

缺少：

```text
/node_modules
*.p12
*.p7b
*.cer
*.key
```

签名材料必须保证不进入仓库。

### P2-5：Linter 配置仍未证明适用于 Lite JS

当前把 `.js` 纳入 TypeScript ESLint 规则。应在 DevEco 中实际执行；如果插件不能解析 Lite JS，应采用独立宿主 ESLint，而非声称已有静态检查。

---

## 6. 推荐目标架构

```text
pages/HML
   ↓ Msg
MVU update（纯）
   ↓ Command
Application Workflow
   ├── 精确采集 Facts
   ├── decide（纯）
   ├── 执行必须效果
   ├── 将效果结果映射成 Outcome Events
   ├── evolve（纯）
   └── 最后持久化
           ↓ Ports
┌───────────────┬───────────────┐
│ Host Adapters │ Device Adapters│
│ tests only    │ GT6 runtime    │
├───────────────┼───────────────┤
│ fixed clock   │ system clock   │
│ memory store  │ Lite storage   │
│ fake reminder │ confirmed API  │
│ recorder nav  │ @system.router │
└───────────────┴───────────────┘
```

### 强制分离

```text
createHostApp()
仅 tests-host 使用

createDeviceApp()
仅 HAP 入口使用
```

---

## 7. 后端/领域与应用层修改代码

> 本项目 v1 没有服务器后端。这里的“后端”指领域核心、应用工作流和平台适配器。

## 7.1 新增统一运行时与设备组合根

### `app/app-runtime.js`

```js
import { rehydrateFromRaw } from '../domain/snapshot.js';
import { createCommandHandler } from './command-handler.js';

/**
 * 只装配已经实现端口的通用应用运行时。
 * 这里不选择任何具体平台，保持六边形边界。
 */
export function createAppRuntime(ports) {
    const handleCommand = createCommandHandler(ports);

    return {
        ports: ports,
        handleCommand: handleCommand,

        probeCapabilities: function () {
            // 能力探测属于 ReminderSchedulerPort，不由领域猜测。
            return ports.reminders.probeCapabilities();
        },

        boot: function () {
            const loaded = ports.store.loadSnapshot();
            if (loaded.tag === 'Err') {
                return Object.freeze({
                    tag: 'Err',
                    error: loaded.error
                });
            }

            const raw = loaded.value.tag === 'Some'
                ? loaded.value.value
                : null;

            // 快照迁移和恢复保持纯函数。
            const restored = rehydrateFromRaw(raw);
            if (restored.tag === 'Err') {
                return restored;
            }

            return Object.freeze({
                tag: 'Ok',
                state: restored.value
            });
        }
    };
}
```

### `app/composition-root.js`

```js
import { createAppRuntime } from './app-runtime.js';
// 其余内存适配器 import 保留。

/**
 * 只供 Node 宿主测试和确定性模拟使用。
 * 正式 app.js 禁止调用该函数。
 */
export function createHostApp(options) {
    const opts = options || {};

    if (!opts.instant && !opts.clock) {
        // 尽早失败，避免 undefined 穿透至 calendar。
        throw new Error('createHostApp requires options.instant or options.clock');
    }

    const ports = {
        clock: opts.clock || createFixedClock(opts.instant),
        calendar: opts.calendar || createFixedCalendar(
            typeof opts.utcOffsetMinutes === 'number'
                ? opts.utcOffsetMinutes
                : 480
        ),
        store: opts.store || createMemoryStore(),
        reminders: opts.reminders || createRecordingReminder({
            capability: opts.capability,
            failKeys: opts.failKeys
        }),
        haptics: opts.haptics || createMemoryHaptics(),
        diagnostics: opts.diagnostics || createMemoryDiagnostics(),
        navigation: opts.navigation || createRecordingNavigation()
    };

    return createAppRuntime(ports);
}
```

### `app/device-composition-root.js`

```js
import { createAppRuntime } from './app-runtime.js';
import { createRouterAdapter } from '../adapters/ui/router-adapter.js';

/**
 * 设备组合根只能引用当前 Lite SDK 已确认可用的适配器。
 *
 * 注意：
 * - 不在这里猜测 reminder/storage/vibrator 的模块名称；
 * - 每个适配器必须先经过 SDK 编译探针；
 * - 后台提醒适配器必须经过 GT6 真机门禁。
 */
export function createDeviceApp(adapters) {
    if (!adapters ||
        !adapters.clock ||
        !adapters.calendar ||
        !adapters.store ||
        !adapters.reminders ||
        !adapters.haptics ||
        !adapters.diagnostics) {
        throw new Error('Device adapters are incomplete');
    }

    return createAppRuntime({
        clock: adapters.clock,
        calendar: adapters.calendar,
        store: adapters.store,
        reminders: adapters.reminders,
        haptics: adapters.haptics,
        diagnostics: adapters.diagnostics,
        navigation: createRouterAdapter()
    });
}
```

在真实适配器未完成前，正式 HAP 不应假装是产品。可以继续只运行 Probe 页面。

---

## 7.2 修复效果失败却仍显示成功

### 领域命令：启用时不要提前发 `PlanEnabled`

当前应将：

```js
[planEnableRequested(), planEnabled()]
```

改成：

```js
// 先表达“请求启用”，成功事件由效果结果产生。
[planEnableRequested()]
```

### 新增效果结果事件

```js
export function remindersRegistered(report) {
    return event('RemindersRegistered', { report: report });
}

export function reminderRegistrationFailed(error) {
    return event('ReminderRegistrationFailed', { error: error });
}

export function snapshotPersistFailed(error) {
    return event('SnapshotPersistFailed', { error: error });
}
```

### 在 `evolve.js` 中处理

```js
case 'RemindersRegistered':
    return ok(copyState(state, {
        // 只有系统注册成功后，才进入 Enabled。
        planLifecycle: planEnabledState(),
        settings: Object.freeze(Object.assign({}, state.settings, {
            enabledFlag: true
        })),
        operationalStatus: Object.freeze({ tag: 'Healthy' }),
        revision: state.revision + 1
    }));

case 'ReminderRegistrationFailed':
    return ok(copyState(state, {
        // 不要继续显示 Enabled。
        planLifecycle: planBlockedState(event.error),
        operationalStatus: Object.freeze({
            tag: 'Degraded',
            reason: event.error
        }),
        revision: state.revision + 1
    }));
```

### 重写效果执行顺序的核心逻辑

```js
import {
    remindersRegistered,
    reminderRegistrationFailed
} from '../domain/events.js';
import { createSnapshot } from '../domain/snapshot.js';

function isPersist(effect) {
    return effect.tag === 'PersistSnapshot';
}

/**
 * 执行业务效果，将真实结果转成领域事件。
 * 持久化始终放在最终状态演化之后。
 */
function executeBusinessEffects(decision, ports, now) {
    const outcomeEvents = [];
    const reports = [];

    for (let index = 0; index < decision.effects.length; index += 1) {
        const effect = decision.effects[index];

        // 旧 Decision 中的 PersistSnapshot 暂不在此执行。
        if (isPersist(effect)) {
            continue;
        }

        const result = interpretEffect(effect, ports, {});
        reports.push(Object.freeze({
            effectTag: effect.tag,
            result: result
        }));

        if (effect.tag === 'RegisterReminders') {
            if (result.tag === 'Ok') {
                outcomeEvents.push(remindersRegistered(result.value));
            } else {
                outcomeEvents.push(reminderRegistrationFailed(result.error));
            }
        }

        if (result.tag === 'Err') {
            // 诊断失败本身不应再次抛异常。
            ports.diagnostics.append(Object.freeze({
                tag: 'EffectFailed',
                effect: effect.tag,
                code: result.error.code,
                at: now
            }));
        }
    }

    return Object.freeze({
        outcomeEvents: Object.freeze(outcomeEvents),
        reports: Object.freeze(reports)
    });
}
```

命令处理器最终流程：

```js
const decisionResult = decide(currentState, command, facts);
if (decisionResult.tag === 'Err') {
    return decisionResult;
}

const execution = executeBusinessEffects(
    decisionResult.value,
    ports,
    facts.now
);

// 先应用“意图事件 + 效果结果事件”。
const allEvents = decisionResult.value.events.concat(
    execution.outcomeEvents
);
const evolved = evolveAll(currentState, allEvents);
if (evolved.tag === 'Err') {
    return evolved;
}

// 最后持久化真实最终状态。
const saved = ports.store.saveSnapshot(
    currentState.revision,
    createSnapshot(evolved.value)
);
if (saved.tag === 'Err') {
    // 不得吞掉持久化失败。
    return Object.freeze({
        tag: 'Err',
        error: saved.error,
        state: evolved.value,
        dirty: true,
        results: execution.reports
    });
}

return Object.freeze({
    tag: 'Ok',
    state: evolved.value,
    results: execution.reports,
    facts: facts
});
```

实际实施时，需要进一步明确哪些效果是事务性必须成功，哪些可以降级，例如：

| 效果 | 失败策略 |
|---|---|
| RegisterReminders | 启用失败/降级 |
| CancelReminders | 保持 Dirty，后续对账重试 |
| PersistSnapshot | 返回错误并标记 Dirty |
| Navigate | 记录错误，业务状态可保留 |
| Vibrate | 降级但不回滚活动会话 |
| Diagnostics | 不影响主流程 |

---

## 7.3 按命令精确采集 Facts

```js
function commandNeedsRegisteredPlan(command) {
    switch (command.tag) {
        case 'EnablePlan':
        case 'DisablePlan':
        case 'ConfigureSchedule':
        case 'PauseUntil':
        case 'PauseForToday':
        case 'PauseForOneHour':
        case 'SkipNext':
        case 'ReconcilePlan':
            return true;
        default:
            return false;
    }
}

function collectRegisteredPlan(ports, command) {
    if (!commandNeedsRegisteredPlan(command)) {
        return ok(Object.freeze([]));
    }

    const listed = ports.reminders.listRegistered('move25');

    if (listed.tag === 'Err') {
        // 不把 unknown 解释为空列表。
        return listed;
    }

    return listed;
}
```

---

## 7.4 增加绝对触发时间和 fingerprint

### 应用层物化

```js
import { err, ok } from '../domain/result.js';

/**
 * 将纯领域中的本地提醒意图解析为平台可注册的绝对提醒。
 * 解析依赖 CalendarPort，因此位于应用层，不放入 domain。
 */
export function materializeReminderPlan(localIntents, calendarPort) {
    const scheduled = [];

    for (let index = 0; index < localIntents.length; index += 1) {
        const intent = localIntents[index];
        const resolved = calendarPort.resolve(
            intent.localDate,
            intent.at
        );

        if (resolved.tag === 'Err') {
            return err(resolved.error);
        }

        const dueAt = resolved.value;
        scheduled.push(Object.freeze({
            tag: 'ScheduledReminder',
            key: intent.key,
            dueAt: dueAt,

            // key 相同但绝对时刻变化时，必须重新注册。
            fingerprint: intent.key.value + '@' +
                dueAt.epochMilliseconds
        }));
    }

    return ok(Object.freeze(scheduled));
}
```

### 对账规则

```js
function sameRegistration(left, right) {
    return left.key.value === right.key.value &&
        left.fingerprint === right.fingerprint;
}
```

系统注册映射必须保存：

```text
semanticKey
systemId
dueAt
fingerprint
adapterVersion
```

---

## 7.5 严格快照解码

```js
function invalidSnapshot(reason, raw) {
    return err(domainError(
        ERROR_CODES.INVALID_SNAPSHOT,
        Object.freeze({
            reason: reason,
            raw: raw
        })
    ));
}

function decodeLifecycle(raw) {
    if (!raw || typeof raw.tag !== 'string') {
        return invalidSnapshot('invalid_lifecycle', raw);
    }

    switch (raw.tag) {
        case 'Disabled':
            return ok(planDisabledState());

        case 'Enabling':
            return ok(planEnablingState());

        case 'Enabled':
            return ok(planEnabledState());

        case 'Paused':
            if (!raw.until || raw.until.tag !== 'Instant') {
                return invalidSnapshot(
                    'paused_without_valid_until',
                    raw
                );
            }
            return ok(planPausedState(raw.until));

        case 'Blocked':
            if (!raw.error || typeof raw.error.code !== 'string') {
                return invalidSnapshot(
                    'blocked_without_error',
                    raw
                );
            }
            return ok(planBlockedState(raw.error));

        default:
            // 未知 tag 不再静默改成 Disabled。
            return invalidSnapshot(
                'unknown_lifecycle_tag',
                raw
            );
    }
}
```

即使 raw 已标记为 `ScheduleSettings`，也应转换为原始 DTO 后重新经过智能构造器，而不是信任嵌套对象。

---

## 7.6 校验提醒触发时间

```js
const EARLY_TOLERANCE_MS = 10 * 1000;
const LATE_TOLERANCE_MS = 5 * 60 * 1000;

function validateFiredReminder(scheduled, firedAt) {
    const delta = firedAt.epochMilliseconds -
        scheduled.dueAt.epochMilliseconds;

    if (delta < -EARLY_TOLERANCE_MS) {
        return err(domainError(
            ERROR_CODES.REMINDER_FIRED_TOO_EARLY,
            Object.freeze({ deltaMs: delta })
        ));
    }

    if (delta > LATE_TOLERANCE_MS) {
        return err(domainError(
            ERROR_CODES.STALE_REMINDER_CALLBACK,
            Object.freeze({ deltaMs: delta })
        ));
    }

    return ok(Object.freeze({
        tag: 'AcceptedReminderFire',
        delayMs: Math.max(0, delta)
    }));
}
```

容忍度最终必须依据 GT6 真机误差实验确定，而不是长期写死。

---

## 8. 前端修改代码

## 8.1 修正页面状态写法

### 当前风险写法

```js
this.data.nextBreak = model.nextBreakText;
```

### 建议写法

```js
this.nextBreak = model.nextBreakText;
```

首页改为：

```js
export default {
    data: {
        capabilityText: '提醒能力未确认',
        capabilityLevel: 'warn',
        planStatusText: '未知',
        nextBreak: '—',
        hasError: false,
        errorText: ''
    },

    onShow: function () {
        this.render();
    },

    render: function () {
        const model = refresh();

        // Lite JS 数据字段作为页面实例属性更新。
        this.capabilityText = model.capabilityBanner.text;
        this.capabilityLevel = model.capabilityBanner.level;
        this.planStatusText = statusText(model.planStatus);
        this.nextBreak = model.nextBreakText;

        const errors = model.errors || [];
        this.hasError = errors.length > 0;
        this.errorText = errors.length > 0
            ? (errors[0].text || errors[0].code || '')
            : '';
    }
};
```

所有页面统一修复，并在 Lite 模拟器确认数据绑定行为。

---

## 8.2 设置页必须从真实模型恢复

```js
const WEEKDAY_NAMES = [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
];

const RHYTHM_PRESETS = [
    { focus: 25, break: 5 },
    { focus: 50, break: 10 },
    { focus: 45, break: 15 },
    { focus: 30, break: 5 }
];

function contains(items, value) {
    return items.indexOf(value) >= 0;
}

function findRhythmIndex(summary) {
    for (let index = 0; index < RHYTHM_PRESETS.length; index += 1) {
        const preset = RHYTHM_PRESETS[index];
        if (preset.focus === summary.focusMinutes &&
            preset.break === summary.breakMinutes) {
            return index;
        }
    }
    return -1;
}

export default {
    data: {
        weekdayOn: [
            true, true, true, true, true, false, false
        ],
        selectedBlock: 0,

        // 默认 25/5，对应索引 0。
        selectedRhythm: 0,

        enabledFlag: false,
        validationText: ''
    },

    onShow: function () {
        const model = refresh();
        const summary = model.settingsSummary;

        this.enabledFlag =
            model.planStatus === 'Enabled' ||
            model.planStatus === 'Paused';

        const selectedDays = summary.weekdays || [];
        const states = [];

        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            states.push(contains(
                selectedDays,
                WEEKDAY_NAMES[index]
            ));
        }

        this.weekdayOn = states;

        const rhythmIndex = findRhythmIndex(summary);
        this.selectedRhythm = rhythmIndex >= 0
            ? rhythmIndex
            : 0;

        // 工作块也必须匹配现有配置。
        // 如果没有匹配预设，不得静默选中第一项。
        this.selectedBlock = findBlockPreset(
            summary.blocks
        );
    },

    onSave: function () {
        if (this.selectedBlock < 0) {
            this.validationText =
                '当前时段不是预设，请先选择工作时段';
            return;
        }

        const weekdays = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            if (this.weekdayOn[index]) {
                weekdays.push(WEEKDAY_NAMES[index]);
            }
        }

        if (weekdays.length === 0) {
            this.validationText =
                '至少选择一个工作日';
            return;
        }

        const rhythm =
            RHYTHM_PRESETS[this.selectedRhythm];

        const result = dispatch({
            tag: 'SettingsSaved',
            raw: {
                // 设置页不应通过保存动作隐式启用/关闭。
                enabledFlag: this.enabledFlag,
                weekdays: weekdays,
                workBlocks:
                    BLOCK_PRESETS[this.selectedBlock],
                focusMinutes: rhythm.focus,
                breakMinutes: rhythm.break
            }
        });

        if (result.errors && result.errors.length > 0) {
            this.validationText =
                result.errors[0].text || '保存失败';
            return;
        }

        navigateBackThroughPort();
    }
};
```

更好的产品设计是：

- 设置只修改规则；
- 启用/关闭只在首页完成；
- 不让“保存设置”同时改变计划生命周期。

---

## 8.3 活动页增加“仅可见时”刷新

### `_app-shell.js`

```js
export function tickVisible() {
    if (!app || !state) {
        return model;
    }

    const nowResult = app.ports.clock.now();
    if (nowResult.tag === 'Err') {
        return model;
    }

    const updated = pureUpdate(model, {
        tag: 'TickVisible',
        now: nowResult.value.epochMilliseconds
    });

    model = updated.model;
    return model;
}
```

### `break-active/index.js`

```js
import {
    dispatch,
    refresh,
    tickVisible
} from '../_app-shell.js';

function formatSeconds(seconds) {
    const safe =
        typeof seconds === 'number' && seconds >= 0
            ? seconds
            : 0;
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;

    return (minutes < 10 ? '0' : '') +
        minutes + ':' +
        (rest < 10 ? '0' : '') +
        rest;
}

export default {
    data: {
        remainingText: '05:00',
        actions: []
    },

    timerId: -1,
    elapsedDispatched: false,

    onShow: function () {
        this.render();
        this.startVisibleTicker();
    },

    onHide: function () {
        this.stopVisibleTicker();
    },

    onDestroy: function () {
        this.stopVisibleTicker();
    },

    render: function () {
        const model = refresh();
        this.applyModel(model);
    },

    applyModel: function (model) {
        this.remainingText =
            formatSeconds(model.remainingSeconds);
        this.actions = model.currentGuidance
            ? model.currentGuidance.actions
            : [];
    },

    startVisibleTicker: function () {
        this.stopVisibleTicker();

        const self = this;

        // 仅用于页面显示，不承担后台计时。
        this.timerId = setInterval(function () {
            const model = tickVisible();
            self.applyModel(model);

            if (model.remainingSeconds === 0 &&
                !self.elapsedDispatched) {
                self.elapsedDispatched = true;

                // 新增 BreakElapsed 消息和领域命令。
                dispatch({ tag: 'BreakElapsed' });

                self.stopVisibleTicker();
            }
        }, 1000);
    },

    stopVisibleTicker: function () {
        if (this.timerId >= 0) {
            clearInterval(this.timerId);
            this.timerId = -1;
        }
    },

    onComplete: function () {
        this.stopVisibleTicker();
        dispatch({ tag: 'CompletePressed' });
    },

    onSkip: function () {
        this.stopVisibleTicker();
        dispatch({ tag: 'SkipBreakPressed' });
    }
};
```

注意：

- `setInterval` 只在页面可见时刷新文本；
- 真正的 5 分钟完成仍应注册短时系统提醒；
- 页面重新显示时从 `endsAt` 重算；
- 需要在 Lite 模拟器验证定时器语法和生命周期。

---

## 8.4 首页改为圆屏友好的滚动或两级菜单

建议首页只放：

- 能力状态；
- 下次活动；
- 立即活动；
- 启用/关闭；
- 更多。

### `pages/home/index.hml`

```html
<div class="container">
    <text class="banner {{capabilityLevel}}">
        {{capabilityText}}
    </text>

    <text class="status">
        计划：{{planStatusText}}
    </text>

    <text class="next">
        {{nextBreak}}
    </text>

    <text class="caption">
        下次活动
    </text>

    <text class="error" if="{{hasError}}">
        {{errorText}}
    </text>

    <button class="btn primary"
            onclick="onStartNow">
        立即活动
    </button>

    <button class="btn"
            onclick="onToggle">
        {{toggleText}}
    </button>

    <button class="btn"
            onclick="onMore">
        更多
    </button>
</div>
```

新增 `pages/more`，使用滚动列表：

```html
<list class="menu">
    <list-item>
        <button class="menu-btn"
                onclick="onPauseHour">
            暂停一小时
        </button>
    </list-item>

    <list-item>
        <button class="menu-btn"
                onclick="onPauseToday">
            暂停今天
        </button>
    </list-item>

    <list-item>
        <button class="menu-btn"
                onclick="onSkipNext">
            跳过下一次
        </button>
    </list-item>

    <list-item>
        <button class="menu-btn"
                onclick="onSettings">
            设置
        </button>
    </list-item>

    <list-item>
        <button class="menu-btn"
                onclick="onDiagnostics">
            诊断
        </button>
    </list-item>
</list>
```

页面中的导航必须发送 MVU 消息或调用 NavigationPort，不再直接导入 `@system.router`。

---

## 8.5 将动作 ID 映射为可本地化文案

```js
const ACTION_TEXT = Object.freeze({
    stand_and_walk: '起身走动 2 分钟',
    simple_stretch: '轻柔伸展肩背',
    look_far: '看向远处并眨眼',
    neck_rolls: '缓慢左右转动头部',
    shoulder_open: '肩膀向后打开',
    hip_circles: '轻柔活动髋部',
    ankle_flex: '活动脚踝和提踵',
    wrist_stretch: '放松手腕和前臂',
    back_extension: '站立伸展背部'
});

function actionText(key) {
    return ACTION_TEXT[key] || '轻松活动一下';
}

function guidanceFor(session) {
    // 查找领域 guidance 后：
    const displayActions = [];

    for (let index = 0; index < item.actions.length; index += 1) {
        displayActions.push(
            actionText(item.actions[index])
        );
    }

    return Object.freeze({
        id: item.id,
        actions: Object.freeze(displayActions)
    });
}
```

正式项目应将这些文案移入资源文件，以便多语言和审校。

---

## 9. 测试补充

### 9.1 宿主测试

必须新增：

1. `createHostApp({})` 明确失败，不再穿透 undefined；
2. RegisterReminders 失败时，状态不得是 Enabled；
3. Store 保存失败时返回 Err/Dirty；
4. listRegistered 失败时，不得当作空列表继续注册；
5. 时区变化导致 fingerprint 变化并重新注册；
6. 同 key 不同 dueAt 不得归类 unchanged；
7. 过早回调被拒绝；
8. 超时回调被诊断为 stale；
9. 未知快照嵌套 tag 返回 INVALID_SNAPSHOT；
10. `ScheduleSettings` 伪 tag 但内部损坏时拒绝；
11. 设置页打开后保存不改变原设置；
12. 25/5 默认不会变成 50/10；
13. 七天工作日往返不丢失；
14. `BreakElapsed` 只触发一次；
15. 效果失败状态可在 UI 明确显示；
16. 所有页面不得直接导入 `@system.router`；
17. 设备组合根不得引用 memory adapters；
18. 正式 app.js 不得调用 createHostApp。

### 9.2 DevEco 模拟器

验证：

- `.hml` 动态 class；
- `if`、`for`；
- `this.field` 响应式更新；
- `list/list-item`；
- 页面生命周期；
- `router.replace/back`；
- 页面可见 ticker；
- 466×466 圆屏裁切；
- 字体和按钮触摸面积；
- HAP 体积和页面资源限制。

### 9.3 GT6 真机

能力门禁：

| Gate | 验收 |
|---|---|
| G0 | 签名 HAP 可安装、页面可运行、日志可读 |
| G1 | 存储/振动/提醒模块可编译 |
| G2 | 权限和开放能力可取得 |
| G3 | 前台 60 秒提醒触发 |
| G4 | 返回表盘和息屏仍触发 |
| G5 | 应用退出后仍触发 |
| G6 | 手机断连后仍触发 |
| G7 | 重启、DND、低电量、容量和误差已记录 |

只有 G0–G6 满足，才能将核心产品状态标记为可靠独立提醒。

---

## 10. 建议实施顺序

### PR 1：修复宿主/设备装配边界

- 新增 `createAppRuntime`；
- `createHostApp` 必须传时钟；
- `app.js` 不再调用 host shell；
- Probe 与产品构建分离。

### PR 2：修复效果结果与状态一致性

- 启用采用 outcome event；
- 持久化最后执行；
- critical effect 失败不返回成功；
- 增加 Dirty/OperationalStatus。

### PR 3：完善时间物化与对账

- ScheduledReminder；
- dueAt/fingerprint；
- 时区变化更新；
- callback tolerance。

### PR 4：严格快照解码

- 所有嵌套值重新验证；
- 未知 tag 显式失败；
- 增加 schema v2。

### PR 5：修复 MVU 和页面响应式

- `this.data.x` → `this.x`；
- 错误不被 projection 清空；
- 导航统一走端口；
- 诊断查询端口化。

### PR 6：圆屏 UI 重构

- 首页减负；
- 更多菜单；
- 设置滚动/拆页；
- 中文动作映射；
- 七天工作日。

### PR 7：可见倒计时和活动结束语义

- TickVisible；
- BreakElapsed；
- 活动结束系统短提醒；
- 不重复震动。

### PR 8：平台能力探针

- 存储；
- 振动；
- 提醒；
- 容量；
- 生命周期矩阵。

### PR 9：真实平台适配器

只实现已获得 `SDK_CONFIRMED`/`DEVICE_CONFIRMED` 的能力。

### PR 10：发布治理

- 最终包名；
- 签名；
- 首页；
- 最小权限；
- 隐私声明；
- 邀请测试；
- 功耗 A/B。

---

## 11. 最终验收标准

### 架构

- `domain/` 零平台依赖；
- 页面不直接导入平台模块；
- host/device composition 分离；
- 端口不暴露测试私有方法；
- 效果结果进入状态机；
- 所有预期错误显式建模。

### 功能

- 默认 25/5；
- 工作日和时段正确；
- 午休、周末不提醒；
- 暂停、跳过、启用、关闭幂等；
- 活动自动到期；
- 设置重启后保留；
- 时区变化后重新注册；
- 损坏快照可诊断和重置。

### 可靠性

- 系统注册失败时不显示 Enabled；
- 持久化失败时不伪装成功；
- 重复/延迟/过早回调可区分；
- 对账最终收敛；
- 真机行为有证据记录。

### UI

- 466×466 无关键内容裁切；
- 主操作单手可触达；
- 文案不是内部 key；
- 能力降级明显；
- 错误可理解；
- 页面重新打开后倒计时正确。

### 发布

- 不使用模板包名；
- 签名配置完整；
- 无密钥、UDID、证书进入 Git；
- Probe 不作为正式首页；
- README 状态与真机证据一致。

---

## 12. 审阅结论

该项目现在已经跨过“架构概念演示”阶段，具备值得继续投资的领域核心和测试基础。但它尚未跨过“设备运行闭环”：

```text
真实时间
→ 真实存储
→ 真实系统提醒
→ 真实振动
→ 真实页面导航
→ 效果结果反馈
→ 状态一致
→ GT6 真机证据
```

下一步不应继续扩张领域功能或增加健康平台范围。应优先解决：

1. 宿主组合根误用于正式入口；
2. 效果失败仍演化成功；
3. 平台能力探针；
4. 圆屏 UI 和页面响应式；
5. 真实适配器与真机验收。

在这些问题解决前，发布结论应维持：

```text
Product: No-Go
Architecture prototype: Go
GT6 capability research: Go
```
