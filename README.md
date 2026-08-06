# Move25 for HUAWEI WATCH GT 6

> 一个为 HUAWEI WATCH GT 6 打造的 HarmonyOS Lite Wearable 节律助手。  
> 工作 25 分钟，活动 5 分钟；低打扰、低功耗、优先在手表本地完成。

## 项目简介

Move25 是一款基于 **FUNAR（Functional Software Architecture）**、**Functional DDD** 与 **Hexagonal Architecture（Ports & Adapters）** 设计的 HarmonyOS Lite Wearable 应用。它为久坐办公用户提供腕上“工作—活动”节律提醒，以最小干扰提示用户起身活动、伸展身体、远眺放松。

项目以领域规则为核心，采用**模块化单体**形态：

- 核心规则（日程、状态机、调度代数）用纯函数表达；
- 提醒、存储、时钟、振动等系统能力通过端口抽象；
- 真实、模拟、测试适配器可自由替换，便于能力探针与单元测试。

## 当前状态

- **阶段**：架构基线 + 能力探针 UI（`entry/src/main/js/MainAbility/pages/index/index` 为临时探针入口）。
- **已完成**：HAP 工程骨架、FUNAR 文档体系、入口页面探针。
- **进行中**：领域内核、端口契约、提醒能力 GT6 真机探针。
- **关键限制**：后台提醒在息屏、应用退出、手机断连后的可靠性尚未经 GT6 真机确认；在未获得 `DEVICE_CONFIRMED` 证据前，不得在产品层承诺可靠后台提醒。

## 技术事实

| 项 | 内容 |
|---|---|
| 目标设备 | HUAWEI WATCH GT 6 |
| 运行形态 | Lite Wearable HAP |
| SDK / API | HarmonyOS Lite 6.1.1(24) |
| 应用模型 | FA（Feature Ability），JavaScript |
| 构建系统 | Hvigor（无 `hvigorw` 包装脚本） |
| 测试框架 | `@ohos/hypium` 1.0.25 |
| 包名 | `com.example.watch`（占位，发布前替换） |
| 开发 IDE | DevEco Studio（Lite SDK 6.1.1） |

## 仓库目录

```text
entry/                           # 唯一可运行模块
  src/main/js/MainAbility/       # 当前 UI 与入口能力
  src/main/resources/            # 图片、字符串等资源
  src/main/config.json           # 模块配置（bundleName、deviceType 等）
  build-profile.json5            # 模块级构建配置
  hvigorfile.ts                  # 模块级 Hvigor 任务
  oh-package.json5               # 模块级依赖
docs/move25_gt6_funar_docs/      # 活跃架构与交付文档（推荐从此开始）
docs/后续延展，暂不考虑/          # 后续方向草稿（如 HealthWeave），当前版本不纳入实施
hvigor/                          # Hvigor 工程配置
build-profile.json5              # 工程级构建配置
hvigorfile.ts                    # 工程级 Hvigor 任务
oh-package.json5                 # 工程级依赖
oh-package-lock.json5            # 工程级锁文件
code-linter.json5                # Linter 规则
```

## 架构核心

1. **Functional Core + Imperative Shell**：`domain/` 不导入 `@ohos.*`、UI、存储或时钟；所有副作用由适配器解释。
2. **不可变值与纯函数**：状态转换、日程生成、计划差异计算均为纯函数，支持固定时间单元测试。
3. **MVU 前端**：页面状态由 `Model + Msg -> Model + Effect` 驱动。
4. **能力门禁**：每个系统级能力（后台提醒、振动、存储）必须有 `SDK_CONFIRMED` 或 `DEVICE_CONFIRMED` 证据，才能在产品层承诺。
5. **无长计时器**：长期提醒委托系统调度，禁止用 `setInterval` 或长 `setTimeout` 模拟后台能力。

## 构建与运行

1. 使用 **DevEco Studio** 打开本仓库，选择 **Lite SDK 6.1.1（API 24）**。
2. 在 DevEco Studio 中选择 product `default`。
3. 使用 **debug** 构建安装到模拟器或 GT6 真机；使用 **release** 构建打包。
4. 构建、签名、运行均通过 DevEco Studio 内置 Hvigor 集成完成。

> 注意：仓库未包含 `hvigorw` 命令行包装或 npm 脚本，请勿在终端直接运行 `hvigor`。

## 测试

- **领域测试**：在 `tests-host/` 中使用固定时间和内存/记录适配器，覆盖核心规则分支。
- **契约测试**：每个端口需有真实适配器与假适配器对照。
- **真机探针**：后台提醒、振动、重启恢复、功耗等行为必须在 GT6 真机验证，模拟器结果不能作为最终证据。
- 当前目标：核心规则 90% 以上分支覆盖，系统适配器具备契约与真机测试。

## 文档地图

详细文档见 `docs/move25_gt6_funar_docs/README.md`，推荐按以下顺序阅读：

1. `00_ARCHITECTURE_CHARTER.md` — 架构宪章
2. `product/01_PRODUCT_VISION_AND_QUALITY_ATTRIBUTES.md` — 产品愿景与质量属性
3. `domain/03_UBIQUITOUS_LANGUAGE.md` — 统一语言
4. `domain/05_FUNCTIONAL_DOMAIN_MODEL.md` — 函数式领域模型
5. `architecture/10_HEXAGONAL_ARCHITECTURE.md` — 六边形架构
6. `architecture/13_FUNCTIONAL_CORE_AND_EFFECT_SHELL.md` — 函数式核心与效果壳
7. `delivery/20_CAPABILITY_PROBE_PLAN.md` — 能力探针计划
8. `delivery/27_IMPLEMENTATION_ROADMAP.md` — 实施路线图

## 后续延展（暂不考虑）

`docs/后续延展，暂不考虑/HealthWeave_GT6_FUNAR_docs/` 是 **HealthWeave GT6** 健康数据平台的早期文档草案，同样采用 FUNAR × Functional DDD × Hexagonal 方法。它面向 HUAWEI WATCH GT 6 上的个人健康与运动数据洞察，不是当前 Move25 v1.0 的实施范围，仅作为后续方向参考。

其文档体系覆盖产品、证据、领域、架构、算法、AI、交付、ADR、模板与参考资料。完整介绍见该目录下的 `README.md`。

> 注意：HealthWeave 涉及更复杂的健康数据授权、传感器开放能力、云端 AI 解释与跨平台同步；在当前 Move25 尚未完成后台提醒能力探针之前，不纳入开发排期。

## 提交约定

遵循 Conventional Commit 风格，示例：

```text
feat(domain): add schedule policy
fix(adapter): preserve semantic key
docs(adr): record decision
probe(reminder): test background trigger on GT6
```

常用分支：`main`、`feature/*`、`adapter/*`、`probe/*`、`adr/*`。

## 安全与隐私

- 不上传用户健康或行为数据，不联网、不登录。
- 不提交签名私钥、证书、密码、手表 UDID 或个人数据日志。
- 构建输出、`.preview/` 等不进入源码目录。

## 版本

- 应用版本：`1.0.0`（见 `entry/src/main/config.json`）
- 架构文档版本：`v2.0`
