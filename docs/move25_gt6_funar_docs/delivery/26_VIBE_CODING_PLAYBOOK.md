# Vibe Coding 架构护栏与提示词

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. AI 角色约束

将以下内容作为每次会话的系统级项目上下文：

```text
你正在实现 HUAWEI WATCH GT 6 的 Lite Wearable 应用 Move25。
架构采用 FUNAR、Functional DDD、Hexagonal Architecture 和 MVU。
领域核心由不可变数据、纯函数、带标签联合和显式 Result 构成。
系统 API 只能出现在 adapters 目录。
任何提醒 API 必须先从当前 Lite SDK 中确认，不能凭标准 Wearable/ArkTS 文档猜测。
禁止用 setInterval 或长 setTimeout 实现后台提醒。
禁止创建网络、账号、云端、传感器常驻功能。
```

## 2. 阶段 Prompt：领域模型

```text
只实现 domain/。不要导入任何平台、UI、存储或时间 API。
先列出值类型、智能构造器、不变量、命令、事件、状态联合和错误。
使用 ES 兼容的普通函数与带 tag 记录；不使用 class，不使用 any，不使用共享可变单例。
为每个函数先写输入输出示例和性质测试，再写实现。
```

## 3. 阶段 Prompt：调度代数

```text
实现 generateBlockPlan、combinePlans、applySuppression、diffPlans。
输入时间使用 LocalDate、MinuteOfDay 或显式 Instant，不读取 Date.now。
证明/测试：排序、范围、周期间隔、结合律、单位元、去重幂等和对账收敛。
```

## 4. 阶段 Prompt：端口

```text
根据 docs/architecture/11_PORT_CONTRACTS.md 定义最小端口。
端口必须使用领域语义，不复制华为平台请求对象。
说明幂等性、部分失败、容量和错误模型。
不要实现真实适配器。
```

## 5. 阶段 Prompt：能力探针

```text
先检查当前 Lite Wearable SDK 的声明和工程模板。
每个候选系统模块创建独立 probe 分支，使用静态导入。
模块不存在时保留完整编译错误作为证据；不要用 try/catch require 探测。
先做 60 秒最小提醒，不加入双按钮、自定义声音或完整 UI。
输出环境、权限、开放能力、编译、安装和真机矩阵结果。
```

## 6. 阶段 Prompt：提醒适配器

```text
仅在探针 G0-G6 通过后实现 ReminderSchedulerPort 适配器。
平台 ID 与领域 SemanticKey 必须双向映射。
register/cancel 必须逐项报告，支持幂等和对账。
平台错误映射为稳定内部错误，同时保留原始错误码到诊断。
```

## 7. 阶段 Prompt：MVU

```text
实现 Model、Msg、update、view projection。
update 必须纯；异步和系统调用返回 Effect/Command，由外壳执行后以 Msg 回传。
可见倒计时使用绝对 endsAt 重算；页面隐藏后停止刷新。
```

## 8. AI 输出验收问题

每次合并前必须回答：

1. 新代码属于领域、工作流、端口还是适配器？
2. 是否引入隐式时间、I/O 或共享可变状态？
3. 是否引用了当前 SDK 未确认的 API？
4. 是否把平台对象泄漏进领域？
5. 是否有针对不变量和失败路径的测试？
6. 是否改变架构决策，需要 ADR？
7. 是否增加功耗或权限？

## 9. 禁止指令

- “一次生成完整 App”；
- “根据经验选择一个提醒 API”；
- “先用 setInterval 跑起来以后再改”；
- “把所有逻辑放进 index.js”；
- “创建 Manager/Service 单例管理状态”；
- “捕获所有异常后忽略”。
