# 函数式核心与效果外壳

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 基本形态

```text
Pure Core:
  validate -> normalize -> decide -> evolve -> plan -> diff -> render model

Effect Shell:
  clock -> storage -> reminder API -> vibration -> navigation -> diagnostics
```

## 2. 效果作为数据

领域不执行副作用，而是返回效果描述：

```javascript
function decision(events, effects) {
  return { events: events, effects: effects };
}

function persistSnapshot(snapshot) {
  return { tag: 'PersistSnapshot', snapshot: snapshot };
}

function registerReminders(intents) {
  return { tag: 'RegisterReminders', intents: intents };
}
```

效果解释器集中处理：

```javascript
function interpret(effect, ports) {
  switch (effect.tag) {
    case 'PersistSnapshot': return ports.store.saveSnapshot(effect.snapshot);
    case 'RegisterReminders': return ports.reminders.register(effect.intents);
    case 'Vibrate': return ports.haptics.vibrate(effect.pattern);
    default: return err('UNKNOWN_EFFECT', effect.tag);
  }
}
```

## 3. 依赖注入

FUNAR 课程把函数工作流、控制流抽象和依赖注入列为宏架构内容。[A2] 本项目通过函数参数注入端口，而不是构造器注入类：

```javascript
function createReconcileWorkflow(ports) {
  return function reconcile(input) {
    // 取得事实 -> 调用纯函数 -> 解释效果
  };
}
```

## 4. 为什么不用 Free Monad 等复杂抽象

Lite JavaScript 运行时和项目规模不需要大型函数式库。效果联合类型加解释器已经提供：

- 可测试性；
- 效果可观察；
- 依赖显式；
- 适配器可替换；
- 控制复杂度可接受。

架构追求函数式语义，不追求语言技巧。

## 5. 故障恢复

外部效果可能部分失败。工作流不得假设“效果列表全部原子成功”。解释器返回逐项报告，应用形成事件：

- `SnapshotPersisted`
- `ReminderRegistered`
- `ReminderRegistrationFailed`
- `PlanReconciliationIncomplete`

下次激活重新对账，恢复到期望状态。
