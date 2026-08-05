# 来源索引

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 架构来源

### [A1] iSAQB：FUNAR 模块主页

- 说明函数式架构使用不可变数据、组合子和数学抽象，并覆盖函数式基础、技术、建模和宏架构。
- https://www.isaqb.org/certifications/cpsa-certifications/cpsa-advanced-level/funar-functional-software-architecture/

### [A2] iSAQB：FUNAR Curriculum 2023.1

- 详细列出纯函数、不可变值、类型、模块、组合子模型、代数结构、DDD、工作流、事件和 MVU。
- https://public.isaqb.org/curriculum-funar/curriculum-funar-en.html

### [A3] Alistair Cockburn：Hexagonal Architecture 原始文章

- 定义内外边界、端口和适配器，以及脱离 UI/数据库测试应用的目标。
- https://alistair.cockburn.us/hexagonal-architecture

### [A4] Scott Wlaschin：Domain Modeling Made Functional

- 以类型表达业务、让非法状态不可表示、组合小函数为工作流，并说明 Functional DDD 自然导向 Hexagonal Architecture。
- https://pragprog.com/titles/swdddf/domain-modeling-made-functional/

## 华为来源

### [H1] 华为穿戴开发入口

- 区分智能与轻量级穿戴开发入口。
- https://developer.huawei.com/consumer/en/multidevice/wearables/get-started/

### [H2] WATCH GT6 跨手机兼容性清单

- 应用市场在 HarmonyOS、Android 9+、iOS 13+ 配对场景均标记支持。
- https://consumer.huawei.com/cn/support/content/zh-cn16066413/

### [H3] WATCH GT 系列应用市场支持列表

- 说明安装路径、iOS 三方应用限制及“柠檬喝水”的手表提醒/华为手机同步说明。
- https://consumer.huawei.com/cn/support/content/zh-cn15878302/

### [H4] AGC 注册运动手表调试设备

- 使用华为手机、HUAWEI DevEco Assistant 和 HUAWEI Health 配对并读取 UDID。
- https://developer.huawei.com/consumer/en/doc/app/agc-help-add-device-0000002283189937

### [H5] Agent-powered Reminder

- 标准 HarmonyOS 的后台代理提醒、场景限制、开放能力和数量限制。仅作为候选能力，不证明 GT6 Lite JS FA 可用。
- https://developer.huawei.com/consumer/en/doc/harmonyos-guides/agent-powered-reminder

### [H6] Huawei Lite Wearable Simulator

- 说明 Lite Wearable 模拟器运行方式及屏幕、电池和传感器模拟能力。
- https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-run-simulator

## 使用规则

- 架构论断优先引用 A1–A4；
- 平台事实优先引用 H1–H6；
- 任何社区项目只能作为辅助线索，不能取代当前 SDK 和 GT6 真机证据；
- 文档访问日期：2026-08-05。
