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

- **阶段与实时证据**：以 [`docs/status/CURRENT_STATE.md`](docs/status/CURRENT_STATE.md) 为唯一动态事实源；API 24 可用的设备适配器已接入，GT6 真机能力探针仍待设备与签名材料。
- **已完成**：
  - 纯领域内核：值类型/智能构造器、公历代数、日程生成与组合代数、抑制（暂停/跳过）、能力门禁策略、`decide`/`evolve` 纯决策与状态机、快照迁移、确定性动作建议轮换、提醒回调幂等（重复/跨键/禁用后回调不覆盖会话）；
  - 端口契约（clock/calendar/store/reminder/haptics/diagnostic/navigation）与内存假适配器；
  - 效果解释器 + 命令处理器（Facts 经端口注入 → 纯决策 → 效果解释 → 状态演化；未持久化的状态绝不作为已提交状态返回）；
  - MVU 纯投影与消息映射 + 首页/活动提醒/活动/设置/诊断 5 个 Lite JS 页面；
  - 系统时钟、本地时区、Lite Storage 与 Lite Vibrator 设备适配器；后台提醒在当前 `liteWearable` SysCap 缺失时明确报告不可用；
  - 宿主测试覆盖设备时钟/日历能力缺口、性质测试、状态机、随机命令序列模型走查、工作流、端口契约、迁移、UI 更新、时间边界/时区/DST 与架构适应度；当前通过数量见动态状态文档。
- **进行中/待办**：模拟器交互验证、存储/振动真机验证、签名与 GT6 能力探针。
- **关键限制**：已安装 API 24 SDK 的 `liteWearable` SysCap 不包含 ReminderAgent，当前构建不会承诺或伪造后台提醒；如后续厂商 SDK/真机开放该能力，必须先通过独立探针再接入。

## 技术事实

| 项 | 内容 |
|---|---|
| 目标设备 | HUAWEI WATCH GT 6 |
| 运行形态 | Lite Wearable HAP |
| SDK / API | HarmonyOS Lite 6.1.1(24) |
| 应用模型 | FA（Feature Ability），JavaScript |
| 构建系统 | Hvigor（无 `hvigorw` 包装脚本） |
| 测试框架 | `@ohos/hypium` 1.0.25 |
| 包名 | `com.move25.watch`（vendor：`Move25`） |
| 开发 IDE | DevEco Studio（Lite SDK 6.1.1） |

## 仓库目录

```text
entry/                           # 唯一可运行模块
  src/main/js/MainAbility/       # 应用源码（FA + JS）
    domain/                      # 纯领域内核（零平台依赖）
    ports/                       # 端口契约
    adapters/memory/             # 内存/记录假适配器（宿主测试）
    adapters/device/             # SDK 已确认的设备适配器与能力缺口适配器
    adapters/ui/                 # 路由器适配器（INFERRED）
    app/                         # 效果解释器、命令处理器、组合根
    pages/                       # MVU 核心 + 产品页面
    tests-host/                  # 宿主测试（node --test）
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

Lite SDK 6.1.1 的旧版 FA loader 会为 `app.js` 生成依赖 IDE 内部路径的
`require("!!…manifest-loader.js…")` 包装器；该调用在 Lite 仿真器运行时不存在，会导致
应用入口在首帧前抛 `ReferenceError`，表现为黑屏。工程根目录的 `hvigorfile.ts` 已注册
`move25-lite-runtime` 构建插件：它在 `LegacyGenerateLiteCode` 前用 SDK 自带 webpack
将 `MainAbility/lite/app-entry.js`（连同领域内核和设备适配器）打成 ES5 自包含入口，并
对所有页面执行“不得残留相对 `require/import`”的校验。修改源码后请执行一次 **Clean
Project → Rebuild**，确保旧的 `loader_out_lite` 缓存被替换；不应手工把 `build/` 目录
提交到版本库。

如果 DevEco 的预览器提示路径字符不合法，请把工程和 DevEco Studio 放到只含 ASCII
字母、数字、空格、`-`、`_`、`.` 的路径下再导入（例如 `/Volumes/ZCH/project/watch`）。

> 注意：仓库未包含 `hvigorw` 命令行包装或 npm 脚本，请勿在终端直接运行 `hvigor`。

## 测试

- **宿主测试（不依赖设备）**：在仓库根目录运行 `npm test`。入口为 `tests-host/run.mjs`——它枚举 `*.test.mjs` 后显式传给 `node --test`，因此**不依赖 Node 版本或 shell 的 glob 展开**（Node 18.13+ 与 Node 21+ 均可直接运行，见已知限制第 7 条）。当前结果见 [`docs/status/CURRENT_STATE.md`](docs/status/CURRENT_STATE.md)。
  - 调度算法示例与边界（日历 oracle、跨月/闰年、25/5、午休、周末、块长等于工作时长、活动结束恰等于块结束）；
  - 性质测试（排序、范围、周期间隔、组合代数、抑制单调、对账收敛、暂停归约、**规则星期并集 ⊇ 配置星期、例外不得进入规则模板**）；
  - 状态机与非法迁移、提醒回调幂等（重复/跨键/禁用后回调不覆盖会话、Enabling 期间回调忽略）、工作流端到端（启用→触发→活动→完成→关闭、部分注册失败与重试、重启恢复、时区变化、**周三启用仍生成 Mon–Fri 周规则、一次性跳过以例外表达**）；
  - 一致性不变量：持久化失败返回 `Err` 且不暴露候选状态、取消提醒失败不提交 `Disabled`、孤儿提醒（含规则残留）可由后续 `Disable`/`Reconcile` 清理、启动自动对账（过期会话归约 + 注册表收敛）；
  - 提醒策略：递归规则必须到达适配器且**覆盖完整配置星期**、递归容量按规则数检查、迟到回调与对账竞态（`dueAt + 容差` 内不取消）、`firedAt` 与 `reminderKey` 校验、DST 边界逐条按日历解析、**规则回调按模板+抑制校验**；
  - 端口契约测试（语义键幂等、部分失败逐项报告、取消一致性、快照并发保护、**一规则一注册的 ruleKey 幂等与展开视图、规则级部分失败、例外静默发生次**）；
  - 持久化迁移（JSON 往返、损坏快照显式失败、伪造 tag 不得绕过重建、版本迁移、损坏快照启动显式报错）；
  - UI 状态更新测试（投影、`TickVisible` 纯重算、降级/不可用能力横幅、消息→命令映射、shell 全流程、自定义设置无损往返、诊断页最新优先、活动页复用）；
  - 架构适应度（FF-01 领域零平台依赖、FF-02 依赖方向、FF-03 无 ArkTS、平台权限白名单；**根路径由 `import.meta.url` 推导，任意检出目录可复现**）。
- **契约测试**：每个端口有内存适配器对照套件（`contract.test.mjs`）。
- **模拟器/真机**：MVU 与页面需在 DevEco 模拟器验证；后台提醒、振动、重启恢复、功耗等行为必须在 GT6 真机验证，模拟器结果不能作为最终证据。

## 能力矩阵（证据等级）

| 能力 | 证据等级 | 当前状态 |
|---|---|---|
| 纯领域内核（不依赖设备） | 宿主测试通过 | 已实现 |
| 端口契约与内存适配器 | 宿主测试通过 | 已实现 |
| MVU 投影与页面 | INFERRED（待模拟器） | 已实现，待 DevEco 验证 |
| 页面导航 `@system.router` | INFERRED（Lite 标准 API） | 已实现，待模拟器确认 |
| 本地存储（Lite storage） | SDK_CONFIRMED | 已接入并编译；待模拟器/真机行为验证 |
| 振动（Lite vibrator） | SDK_CONFIRMED | 已接入并编译；待真机触感验证 |
| 后台提醒：前台触发 | SDK 不支持当前目标 | `liteWearable` SysCap 无 ReminderAgent，UI 明确禁用 |
| 后台提醒：表盘/息屏/退出/断连 | UNKNOWN | 待探针（Probe 3） |
| 后台提醒：重启/免打扰/低电量/容量 | UNKNOWN | 待探针（Probe 3/4） |

证据等级定义：`OFFICIAL_CONFIRMED`（华为官方确认）/ `SDK_CONFIRMED`（当前 SDK 声明中可编译）/ `DEVICE_CONFIRMED`（GT6 真机验证）/ `INFERRED`（须标注，不能作验收依据）/ `UNKNOWN`（须通过探针或工单消除）。

## 已知限制

1. 后台提醒可靠性未获 `DEVICE_CONFIRMED`，不得据此承诺产品级后台行为；当前 UI 如实展示能力状态。
2. 长期提醒绝不使用 `setInterval`/长 `setTimeout` 承担；倒计时只在页面可见时由 `TickVisible` 从绝对 `endsAt` 重算。
3. 系统时间手动修改/时区变化后，下次激活执行全量对账；快照损坏时应用显式报错并可由用户重置，不回退默认而不告知。
4. 页面导航仍为 `INFERRED`；存储和振动为 `SDK_CONFIRMED`，均需在模拟器/GT6 上升级为设备证据。
5. 产品入口为 `pages/home`；DevEco 模板遗留的 `pages/index` 已清理，避免预览器与运行入口不一致。
6. `code-linter.json5` 已把 `**/*.js` 纳入 `files`，但该配置仅经 JSON5 语法自检，未经 DevEco Studio 同步验证；若同步或 lint 报解析问题，回退为仅 `**/*.ets` 即可。
7. 宿主测试入口 `npm test` 经 `tests-host/run.mjs` 显式枚举测试文件，**不依赖** Node 版本或 shell 的 glob 展开（Node 18.13+ 与 Node 21+ 均可运行；Node 24 在 Windows 上不接受目录参数、Node 18 不展开 glob，故不用这两种形式）。注意：`run.mjs` 不可在 `node --test run.mjs` 下运行（测试运行器会递归检测并跳过子进程，造成假绿），它检测到该上下文会以非 0 退出码报错。
8. 递归提醒（RecurringCalendar）路径的端口契约已闭合（ruleKey 身份、一规则一注册、例外表达、回调映射），但**真机适配器尚未实现**；探针阶段建议先验证一次性提醒路径，递归路径待契约契约测试通过后接入。

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
