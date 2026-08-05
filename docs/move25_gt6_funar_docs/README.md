# Move25 FUNAR 开发文档体系

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 文档目的

本仓库不是传统的“页面—服务—数据库”式设计说明，而是一套以 **Functional Software Architecture（FUNAR）**、**Functional DDD** 与 **Hexagonal Architecture（Ports & Adapters）** 为核心的可执行架构规范。

Move25 的业务看似简单，但包含一个决定成败的技术不确定性：HUAWEI WATCH GT 6 的 Lite Wearable 普通第三方应用，是否拥有在息屏、应用退出和手机断连后仍能触发的系统级提醒能力。因此，本体系同时解决两类问题：

1. 把 25 分钟工作、5 分钟活动、工作时段、暂停和跳过等规则建模为可验证的纯函数领域；
2. 把提醒、振动、存储、系统时间和页面生命周期隔离为可替换适配器，并通过能力探针决定产品是否可以兑现“纯手表后台提醒”。

## 2. 架构核心句

> **不可变数据描述事实；纯函数产生决策；工作流组合函数；端口描述效果；适配器解释效果；系统能力以数据进入领域，而不是以隐式全局依赖渗入领域。**

## 3. 项目架构定位

- **部署形态**：一个 Lite Wearable HAP；不是微服务。
- **逻辑形态**：模块化单体，由一个核心域和若干支持/通用子域组成。
- **领域内核**：无系统 API、无 UI、无文件 I/O、无全局可变状态、无后台计时器。
- **效果边界**：提醒、存储、时钟、振动和日志全部通过端口调用。
- **前端模式**：Model–View–Update（MVU）；`update` 为纯函数。
- **后台策略**：系统代理调度优先；禁止用长时间 `setTimeout`/`setInterval` 冒充可靠后台能力。
- **技术门禁**：提醒端口的真实适配器未通过 GT6 真机测试前，产品不得宣称可靠后台提醒。

## 4. 文档地图

| 目录 | 内容 |
|---|---|
| `product/` | 产品愿景、质量属性、PRD、验收边界 |
| `domain/` | 统一语言、上下文地图、代数数据模型、不变量、工作流、状态机、调度代数 |
| `architecture/` | 六边形架构、端口、适配器、函数式核心、MVU、持久化、能力门禁、低功耗、错误恢复 |
| `delivery/` | 华为技术事实、能力探针、测试、架构适应度函数、隐私、发布、仓库规范、Vibe Coding、实施路线 |
| `adr/` | 关键架构决策记录 |
| `templates/` | 环境、探针、端口契约、发布与 ADR 模板 |
| `references/` | 来源索引与需求—设计—测试追踪矩阵 |

## 5. 推荐阅读顺序

1. `00_ARCHITECTURE_CHARTER.md`
2. `product/01_PRODUCT_VISION_AND_QUALITY_ATTRIBUTES.md`
3. `domain/03_UBIQUITOUS_LANGUAGE.md`
4. `domain/05_FUNCTIONAL_DOMAIN_MODEL.md`
5. `architecture/10_HEXAGONAL_ARCHITECTURE.md`
6. `architecture/13_FUNCTIONAL_CORE_AND_EFFECT_SHELL.md`
7. `architecture/16_CAPABILITY_GATED_ARCHITECTURE.md`
8. `delivery/20_CAPABILITY_PROBE_PLAN.md`
9. `delivery/26_VIBE_CODING_PLAYBOOK.md`
10. `delivery/27_IMPLEMENTATION_ROADMAP.md`

## 6. 证据等级

| 等级 | 含义 | 处理规则 |
|---|---|---|
| `OFFICIAL_CONFIRMED` | 华为或架构原始资料明确确认 | 可写入正式设计 |
| `SDK_CONFIRMED` | 在当前安装 SDK 声明中找到并可编译 | 可进入适配器实现 |
| `DEVICE_CONFIRMED` | 已在目标 GT6 真机验证 | 可写入产品承诺 |
| `INFERRED` | 基于公开事实推断 | 必须标注，不能作为验收依据 |
| `UNKNOWN` | 尚无足够证据 | 必须通过探针或工单消除 |

## 7. 当前最重要结论

- GT6 的正式应用安装可以经华为运动健康应用市场覆盖 Android、iOS 和 HarmonyOS 配对生态。[H2]
- “柠檬喝水”证明 GT 系列存在手表端配置和提醒类产品，但官方说明其数据同步仅支持华为手机；它是产品标杆，不是公开提醒 API 的技术证明。[H3]
- 华为公开的 Lite Wearable 调试设备注册流程使用华为手机、HUAWEI Health 与 HUAWEI DevEco Assistant 获取 UDID。[H4]
- 标准 HarmonyOS 代理提醒能在应用后台或进程终止后由系统代理触发，但其 ArkTS API 和开放能力限制不能直接等同于 GT6 Lite Wearable 可用性。[H5]

完整来源见 `references/30_SOURCES.md`。
