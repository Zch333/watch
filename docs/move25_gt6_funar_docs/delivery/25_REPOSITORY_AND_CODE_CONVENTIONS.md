# 仓库与代码组织规范

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 推荐目录

```text
entry/src/main/js/MainAbility/
  app/
    composition-root.js
    command-handler.js
    effect-interpreter.js
  domain/
    values.js
    schedule.js
    plan.js
    commands.js
    events.js
    state.js
    decisions.js
    errors.js
  workflows/
    configure-schedule.js
    enable-plan.js
    reconcile-plan.js
    handle-reminder.js
    break-session.js
  ports/
    clock-port.js
    calendar-port.js
    store-port.js
    reminder-port.js
    haptics-port.js
    diagnostic-port.js
  adapters/
    ui/
    storage/
    reminder/
    haptics/
    time/
    diagnostics/
  pages/
    home/
    break/
    settings/
    diagnostics/
  tests-host/
```

具体路径以 DevEco Lite 模板为准，但依赖方向保持不变。

## 2. 编码风格

- 优先小函数和普通记录；
- 不创建仅包装数据的类；
- 不原地修改输入数组和对象；
- 所有联合值使用 `tag`；
- 所有预期失败返回 `Result`；
- 不用 `null` 同时表示多个语义；
- 不在核心中使用系统时间和随机数；
- 不将 UI 文案作为领域状态。

## 3. 兼容性约束

Lite JavaScript 语法和运行时能力必须以当前 SDK/模拟器/真机为准。Vibe Coding 工具不得默认使用 Node.js、浏览器或现代 TypeScript 全部特性。

## 4. Git 分支

- `main`：通过门禁的稳定架构；
- `probe/*`：每个能力一个独立实验；
- `feature/*`：业务功能；
- `adapter/*`：平台适配器；
- `adr/*`：架构决策。

## 5. 提交约定

```text
feat(domain): add pause suppression policy
probe(reminder): test static import in SDK x.y
fix(adapter): preserve semantic key on partial failure
docs(adr): decide rolling reminder window
```

## 6. 禁止提交

- 私钥、证书密码、签名材料；
- 手表 UDID；
- 含个人数据的日志；
- 未注明来源的大段 AI 生成平台 API；
- 构建产物进入源码目录。
