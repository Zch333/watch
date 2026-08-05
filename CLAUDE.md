# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Move25：面向 HUAWEI WATCH GT 6（Lite Wearable）的工作—活动节律提醒应用（25 分钟工作 / 5 分钟活动），单 HAP、无网络、无云端。架构基线为 **FUNAR × Functional DDD × Hexagonal Architecture**，完整规范见 `docs/move25_gt6_funar_docs/`。

**当前状态**：源码仍是 DevEco Lite 模板脚手架（`entry/src/main/js/MainAbility/` 下只有 `app.js` 和 `pages/index` 示例页），领域内核、端口、适配器均未实现，也无任何测试代码。开发按 `delivery/27_IMPLEMENTATION_ROADMAP.md` 的 Phase 0–6 推进。

**范围边界**：`docs/后续延展，暂不考虑/` 下的 HealthWeave 文档是搁置的远期扩展，不属于当前范围，不要据此实现。

## 构建与运行

- 工程为 **legacy FA 模型**：`entry/src/main/config.json`（非 module.json5）+ JS MainAbility（`srcLanguage: "js"`）。页面是 Lite JS 的 `.hml/.css/.js`，**不是 ArkTS `.ets`**。
- SDK 6.1.1(24)，目标设备类型 `liteWearable`；构建配置在 `build-profile.json5`、`hvigor/hvigor-config.json5`。
- 仓库内没有 `hvigorw` 包装脚本，构建/安装/签名经 DevEco Studio（内置 hvigor 位于 DevEco Studio.app 的 `Contents/tools/hvigor/bin/hvigorw`）完成。
- 测试框架 `@ohos/hypium`（1.0.25）已声明为 devDependency，但尚无测试目录。按 `delivery/21_TEST_STRATEGY.md`，领域/工作流/性质测试是纯 JS，可在宿主 Node 环境直接运行，不依赖设备。
- 代码检查规则在 `code-linter.json5`（@ohos 安全/性能插件 + typescript-eslint）。

## 架构（不可违背）

核心句：**不可变数据描述事实；纯函数产生决策；工作流组合函数；端口描述效果；适配器解释效果；系统能力以数据进入领域，而不是以隐式全局依赖渗入领域。**

计划目录（位于 `entry/src/main/js/MainAbility/` 下，依赖方向不可逆转）：`domain/`（纯领域，无任何平台依赖）→ `workflows/`（函数管道）→ `ports/`（契约，领域语义）→ `adapters/`（平台实现，分 ui/storage/reminder/haptics/time/diagnostics）、`app/`（composition-root、command-handler、effect-interpreter）、`pages/`、`tests-host/`。

**架构不可违背规则**（`00_ARCHITECTURE_CHARTER.md` 第 6 节）：
1. `domain/` 实现不得导入任何 `@system.*`、`@ohos.*` 或 UI 模块。
2. 领域函数不得直接读取当前时间；时间必须作为值传入。
3. 领域函数不得直接写存储、振动或注册提醒；只能返回效果描述。
4. 长期提醒不得由 JavaScript 定时器承担（优先系统代理调度；禁止用 `setInterval`/长 `setTimeout` 冒充后台能力）。
5. 没有 `DEVICE_CONFIRMED` 证据，不得宣称提醒在息屏、杀进程或断连后可靠。
6. 任何降级模式必须显式展示，禁止静默从系统提醒退化为前台计时。
7. 所有提醒注册必须可重入、可对账、可修复。

其余关键约束：
- 前端采用 **MVU**：`Model + Msg -> Model + Effect`，`update` 必须为纯函数；可见倒计时用绝对 `endsAt` 重算，页面隐藏后停止刷新。
- 领域用带 `tag` 的联合值表达 ADT；所有预期失败进显式 `Result`，不用异常作正常控制流；禁止用 `null` 表示多个语义。
- 编码风格：优先小函数和普通记录；不创建仅包装数据的类；不原地修改输入数组/对象；不在核心使用系统时间和随机数；不将 UI 文案作为领域状态。
- Lite JS 兼容性：语法和运行时能力以当前 SDK/模拟器/真机为准，不得默认 Node.js、浏览器或现代 TypeScript 特性可用；不引入 Lite 运行时不支持的大型 FP 库。

## 证据等级（文档事实标注）

`OFFICIAL_CONFIRMED`（华为官方确认）/ `SDK_CONFIRMED`（在当前 SDK 声明中找到并可编译）/ `DEVICE_CONFIRMED`（GT6 真机验证，可写入产品承诺）/ `INFERRED`（必须标注，不能作验收依据）/ `UNKNOWN`（须通过探针或工单消除）。**任何提醒类 API 必须先从当前 Lite SDK 声明确认，不能凭标准 Wearable/ArkTS 文档猜测。**

## 文档体系

阅读入口：`docs/move25_gt6_funar_docs/README.md`（文档地图 + 推荐阅读顺序；`Move25_FUNAR_开发总册.md` 为自动合并版，各分册才是事实源）。

- `00_ARCHITECTURE_CHARTER.md` — 架构宪章：使命、原则落地、非目标、不可违背规则
- `adr/ADR_INDEX.md` — 9 个已接受 ADR：Standalone-first、Lite Wearable 基线、函数式核心与六边形边界、提醒能力门禁、绝对时间/禁长 JS 定时器、MVU 前端、无网络无持续传感器、JS 运行时 ADT、单 HAP 模块化单体
- `domain/` — 统一语言、代数数据模型、不变量、工作流、状态机、调度代数（`03`–`09`）
- `architecture/` — 六边形、端口契约（`11`）、适配器目录（`12`）、函数式核心与效果外壳（`13`）、MVU（`14`）、持久化（`15`）、能力门禁（`16`）、低功耗（`17`）、错误模型（`18`）
- `delivery/` — 技术可行性（`19`）、能力探针计划（`20`）、测试策略（`21`）、适应度函数（`22`）、隐私权限（`23`）、仓库与代码规范（`25`）、Vibe Coding 护栏（`26`）、实施路线图（`27`）
- `templates/` — 探针结果、端口契约测试、ADR、发布检查清单等模板

## Git 约定

- 分支：`main`（通过门禁的稳定架构）、`probe/*`（一个能力一个探针分支）、`feature/*`、`adapter/*`、`adr/*`
- 提交前缀：`feat(domain):`、`probe(reminder):`、`fix(adapter):`、`docs(adr):`
- 禁止提交：私钥/证书/签名材料、手表 UDID、含个人数据的日志、未注明来源的大段 AI 生成平台 API、构建产物

## 工作方式提示

`delivery/26_VIBE_CODING_PLAYBOOK.md` 是针对本仓库的 AI 协作护栏（阶段化提示词 + 合并前验收问题 + 禁止指令，如禁止"一次生成完整 App"、禁止"先用 setInterval 跑起来以后再改"）。涉及架构决策时先查阅对应 ADR，新增决策按 `templates/ADR_TEMPLATE.md` 记录。
