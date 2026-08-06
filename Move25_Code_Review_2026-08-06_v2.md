# Move25 for HUAWEI WATCH GT 6 代码审阅报告（v2.2）

> 审阅方式：对照 `docs/move25_gt6_funar_docs/` 文档体系（产品 PRD、领域文档、架构文档、交付文档、ADR）对 `entry/src/main/js/MainAbility/` 全部源码进行全量审阅
> 审阅日期：2026-08-06
> 审阅范围：domain（20 文件）/ app（6 文件）/ ports（7 文件）/ adapters（9 文件）/ pages（13 文件）/ tests-host（14 文件，178 用例）
> 证据说明：本次审阅实际执行了 `node --test`（**178 个宿主测试全部通过**，原始输出见附录 A），并用独立探针脚本实证了递归规则视界缺陷（脚本全文与输出见附录 A）
> 基线：仓库 `master` 顶端 `72019dc4a90f30e8525aa23487f2002f37b1d59d`（审阅时点，与报告内容同基线）

## 修订记录（v2.0 → v2.1 → v2.2）

本版依据一份外部复核意见（6 项）对 v2.0 逐条验证并修订，处置结果见**附录 B 修订处置表**。主要变更：

1. **撤回误报**：删除原 P2-01"`SkipNext` 被注册表过度阻塞"（复核确认 `SkipNext` 经 `reconcileEffects`→`diffPlans` 确实消费 `registeredPlan`，事实依赖成立）；
2. **升格递归提醒问题**：新增 **P1-01 递归提醒注册模型契约未闭合**（rule/occurrence 身份、单次例外表达、结算与取消语义、回调映射），原 P1-01 深化为 **P1-02 周规则生成把一次性例外固化为永久规则**（含 3 天视界实证、未来过滤/暂停/跳过折叠问题、测试固化缺陷的证据）；
3. **新增 P1-04**：`fitness.test.mjs` 硬编码绝对路径 `Z:/work/watch` + `npm test` glob 可移植性（测试证据链完整性）；
4. **修正 P1-02（现 P1-03）现象描述**：到期页按钮失败后**无可见错误反馈**（HML 无错误展示元素），而非"报操作失败"；
5. **补充附录 A 测试与探针证据包**（Node 版本、命令、原始输出、退出码、commit SHA、探针脚本全文），使"178 全绿"可独立复验；
6. **收紧最终结论**：递归提醒契约重构应先于 GT6 探针，不再表述为"修两个 P1 即可进入候选阶段"。

### v2.2（第二轮外部复核，8 项意见逐条验证后修订）

1. **修正编辑遗留**：上一轮问题数由"5 P0 / 7 P1 / 3 P2"更正为"5 P0 / **11** P1 / 3 P2"（复验表实际列 11 项 P1）；
2. **P0-05 复验结论收紧**：由"已修复（按门禁语义）"改为"**◑ 架构处置已修复；功能缺口仍存在**"（真实适配器仍缺失、产品不可用，等待 Phase 3/4）；
3. **P1-03 定性修正**：由"竞态"改为"**到期归约与页面导航的确定性顺序错误**"——保存成功时 `refresh→Finished→停表→不导航` 是正常执行路径，非偶发竞争；
4. **P1-02 设备端表现表述收紧**：一次性例外"污染规则模板"的设备最终表现改为"**未定义且高风险**"（可能槽位缺失、旧规则残留或重复注册，取决于 P1-01 尚未定义的适配器替换语义），不再断言唯一确定的"永久消失"；
5. **P1-04 严重度标准明确**：定位为"**工程证据链 P1**"（非生产运行时 P1），并说明定级理由；
6. **发布路径细化**：区分路径 A（探针阶段暂不启用 `RecurringCalendarStrategy`，并行验证一次性提醒/存储/振动/生命周期）与路径 B（契约重构完成后启用递归路径）——"递归契约重构先于递归提醒的设备集成探针，但不阻塞一次性路径探针"；
7. **证据包升级**：新增 `Move25_Code_Review_2026-08-06_evidence/` 附件（完整 TAP 1078 行、探针脚本、探针输出，均附 SHA-256）与审计级复现命令序列（附录 A.2）；
8. **评价性措辞收敛**：删除"同类项目中属于上乘"等无基准横向评价，改为可核验的事实描述（第十章）。

---

## 〇、审阅依据（文档体系 → 代码的对照基线）

| 文档 | 对应代码 | 关键对照点 |
|---|---|---|
| `00_ARCHITECTURE_CHARTER.md` 7 条不可违背规则 | `domain/`、`app/` | domain 零平台依赖、时间作值传入、效果描述化、禁长定时器、能力门禁、显式降级、可重入对账 |
| `product/01/02`（愿景、PRD、验收） | 全部 | FR-01~07、NFR-01~05 逐条映射（见第三章） |
| `domain/03~09`（统一语言、模型、不变量、工作流、状态机、调度代数） | `domain/*.js` | 10 条强不变量、状态机转换、调度公式 |
| `architecture/10~18`（六边形、端口、适配器、函数式核心、MVU、持久化、门禁、低功耗、错误模型） | `ports/`、`adapters/`、`app/`、`pages/mvu/` | 7 个端口契约、效果解释器、快照迁移、错误分类 |
| `delivery/19~28`（证据、测试策略、适应度函数、代码规范、路线图） | `tests-host/`、`config.json` | FF-01~03、测试金字塔、Phase 0–7 |
| `adr/ADR-0001~0009` | 全部 | Standalone-first、Lite 基线、函数式核心、能力门禁、绝对时间、MVU、无网络、JS ADT、单 HAP |

**文档体系核心句（衡量代码的第一把尺子）**：

> 不可变数据描述事实；纯函数产生决策；工作流组合函数；端口描述效果；适配器解释效果；系统能力以数据进入领域，而不是以隐式全局依赖渗入领域。

---

## 一、审阅结论

### 1.1 总体判断

本轮审阅的代码已经是一套**架构纪律相当完整**的实现，与 v2.0 文档体系高度吻合：

- `domain/` 20 个文件全部为纯 ES 模块：无 `@system.*`/`@ohos.*`/`Date.now()`/`setInterval`/`Math.random()`（FF-01 由适应度测试守护——但该测试本身存在可复现性缺陷，见 P1-04）；依赖方向正确（FF-02）；无 ArkTS 混入（FF-03）；
- 时间、日历、已注册计划全部以 **Facts 值**注入领域，领域从不读时钟；
- 决策产出 **事件 + 效果描述**，效果由 `effect-interpreter.js` 统一解释，持久化由命令处理器在结算后直接执行（不是效果）；
- `settlePlanLifecycle` 用注册结果**门禁 `PlanEnabled` 事件**——注册失败绝不宣称"已启用"；
- 快照**严格解码**：损坏/伪造 tag 显式失败，不回退默认而不告知；
- 提醒回调幂等三规则（重复/跨键/禁用后）与 2026-08-06 文档修订完全一致；
- 178 个宿主测试（含性质测试、随机命令序列模型走查、端口契约、适应度）全部通过（原始输出见附录 A）。

上一轮审阅报告的 5 个 P0、**11** 个 P1、3 个 P2 问题**已逐条复验**（见 5.1 复验表）：其中 P0-01~04 与 10 个 P1 为功能修复且到位；**P0-05 属"架构处置已修复、功能缺口仍在"**（真实适配器缺失，等待 Phase 3/4，见 5.1 复验表 P0-05 行）。"审阅→修复→回归"闭环运转良好。

### 1.2 但当前仍不具备发布条件

1. **真实设备适配器全部缺失**：产品 HAP（`app.js`）目前只能装配 `navigation` 一个适配器，`createDeviceApp` 因缺 6 个必需适配器而 fail-fast，真机上会显示"平台适配器未就绪"。这是**诚实的能力门禁行为**（符合 ADR-0004），但也意味着 Phase 3/4 尚未推进，产品不可用；
2. **递归提醒路径存在架构级缺陷（本轮升格）**：不仅"3 天视界"导致规则星期采样不全（已实证），更根本的是**端口与领域身份模型未闭合**——周规则无稳定 `ruleKey`、无"一规则一系统注册"的适配器语义、无单次例外表达、结算与取消均按 concrete key 运作（P1-01/P1-02，见 5.2）。`workflow.test.mjs` 甚至把"周一启用→规则含 `['Mon','Tue','Wed']`"断言为期望行为，**测试把缺陷固化为正确行为**；
3. **活动到期页存在确定性闭环顺序错误**（P1-03）：保存成功时"refresh 归约 → Finished → 停表不派发 → 不导航"是正常执行路径而非偶发竞态，用户停留在已过期页面，按钮点击无可见反馈（页面无错误展示元素），`Finished` 会话无任何页面确认路径；
4. **测试工具链可复现性缺陷**（P1-04，定位为**工程证据链 P1**、非生产运行时 P1）：`fitness.test.mjs` 硬编码本机绝对路径 `Z:/work/watch`——换目录检出可能误查另一份源码或直接失败；`npm test` 的 glob 在 Node 18 + Windows `cmd.exe` 下不可靠；
5. 若干 P2/P3 级小问题与文档漂移（见 5.2/5.3）。

### 1.3 发布判定表

| 维度 | 结论 |
|---|---|
| 领域模型与调度代数（一次性提醒路径） | 成熟，178 测试全绿（证据见附录 A） |
| 架构可测试性 / 适应度 | 逻辑良好；**守护测试本身存在可复现性缺陷（P1-04）** |
| 上轮 P0/P1 修复 | 10 项功能修复到位；P0-05 为架构处置修复，功能缺口仍在（Phase 3/4 阻塞） |
| 递归提醒（RecurringCalendar）路径 | **存在 P1 级架构缺陷：契约未闭合 + 规则生成固化例外** |
| 活动到期 UX | 存在 P1 状态/导航闭环缺口 |
| 真实设备适配器 | 未实现（Phase 3 探针阻塞） |
| 时区 / DST | 设计已闭环（逐条日历解析），待真机验证 |
| 发布元数据 | vendor 仍为占位 `example`（发布门禁项） |
| 发布准备度 | **不具备发布条件**（诚实呈现，一次性提醒路径无致命伤；递归路径需先重构） |

---

## 二、具体需求

以下需求与验收标准提取自 `product/02_PRD_AND_ACCEPTANCE.md`、`product/01_PRODUCT_VISION_AND_QUALITY_ATTRIBUTES.md`，并补充 `domain/06`、`domain/07`、`domain/09` 的规则细节。

### 2.1 功能需求（FR）

**FR-01 工作节律配置**
用户可配置：启用的星期；一个或多个工作时间段；专注时长；活动时长；是否启用提醒计划。
- 默认值：周一至周五；09:00–12:00、13:30–18:00；专注 25 分钟；活动 5 分钟。
- 验收：非法时间块不保存；重叠时间块被拒绝或规范化；保存后产生新的期望提醒计划。

**FR-02 提醒计划管理**
支持：启用计划；关闭计划；暂停一小时；暂停到当天结束；跳过下一次活动；设置变更后的提醒重新对账；应用重启后的提醒恢复和清理。
- 验收：能力未知或不支持时不得显示"可靠提醒已启用"；错误可诊断。

**FR-03 活动会话**
用户能够：从提醒页开始活动；从首页立即开始活动；跳过活动；完成活动；查看可见页面倒计时；接收活动开始和结束的振动反馈。
- 验收：点击开始后记录活动会话及绝对结束时间；屏幕熄灭后重新打开按结束时间重算剩余时间。

**FR-04 系统提醒一致性**
- 验收：注册/取消按语义键幂等；部分失败逐项报告；对账幂等（同一输入重复执行第二次差异为空）；启动、设置变化、时间/时区变化后执行对账。
- ⚠ 延伸要求（`domain/09` 调度代数 + `architecture/16` 能力策略）：当平台支持周重复时，**周规则必须覆盖配置的完整星期集合**——这是 FR-04 在首选策略路径上的隐含验收（当前未满足，见 P1-02）。

**FR-05 状态持久化**
- 验收：完整快照原子保存；保存失败保留上一有效版本；读取按"解析→迁移→验证"进行；损坏快照显式失败并可由用户重置，不回退默认而不告知。

**FR-06 能力门禁**
- 验收：只有 `Supported` 能力才允许呈现"可靠后台已启用"；`Unknown` 不是支持状态；任何降级必须显式展示。

**FR-07 诊断能力**
- 验收：只读诊断页展示计划状态、能力、已注册提醒数、快照版本、最近诊断条目；诊断内容不含健康数据/账号/个人数据。

### 2.2 非功能需求（NFR）

| 编号 | 需求 | 验收要点 |
|---|---|---|
| NFR-01 | 可靠性 | 真机连续三天无漏报（门禁：探针未过不可承诺）；注册失败不得显示已启用 |
| NFR-02 | 低功耗 | 平时无常驻 JS；页面熄灭停止刷新；长期提醒委托系统调度；不用长定时器/轮询 |
| NFR-03 | 可恢复性 | 重启恢复：过期会话归约为 `Finished(Expired)`；暂停过期自动恢复；注册表收敛 |
| NFR-04 | 可测试性 | ≥90% 业务分支宿主纯函数测试；适配器契约测试；适应度函数自动守护；**测试须可在任意检出环境复现（不得硬编码本机路径）** |
| NFR-05 | 圆屏交互 | 内容在安全区中心；单次提醒正文≤3 行；两步内完成"开始/跳过"；OLED 深色 |

### 2.3 核心调度公式（领域 09，代码必须满足）

```
cycle = focus + break
cycleStart = block.start
while cycleStart + focus <= block.end:
    emit BreakStart(cycleStart + focus)      # 允许最后一个活动点与块结束重合
    cycleStart = cycleStart + cycle
# 语义键：break-start:<rhythmVersion>:<localDate>:<minuteOfDay>
# 计划组合：combine(a,b) = sortByTime(uniqueBySemanticKey(a ++ b))   （结合律/单位元/幂等）
# 对账：diffPlans(desired, registered) -> { toRegister, toCancel, unchanged }
# 周重复（09 能力驱动策略）：supportsRecurring 时按分钟+星期折叠为 Weekly 规则
```

### 2.4 10 条强不变量（领域 06，代码必须满足）

1. `WorkBlock.start < WorkBlock.end`；2. 同日工作块不重叠；3. `focusMinutes > 0 ∧ breakMinutes > 0`；4. 只在启用星期生成提醒；5. 仅当完整工作段能在块结束前完成才生成活动开始点；6. 语义键计划内唯一；7. 暂停截止前提醒不进期望计划；8. `SkipNext` 最多抑制一个未来提醒；9. `Active.endsAt > Active.startedAt`；10. 能力非 `Supported` 不得呈现"可靠已启用"。

### 2.5 状态机（领域 08）

计划生命周期：`Disabled → Enabling → Enabled | Blocked`；`Enabled ↔ Paused`；`Blocked → Disabled`。
活动会话：`NoBreak → Due → Active → Finished → NoBreak`；`Active → Finished`（完成/到期）；`Due → Finished`（跳过）。
回调幂等规则（2026-08-06 修订）：Due/Active 期间回调不迁移状态仅记诊断；Disabled/Blocked 后回调忽略；Finished 可被新有效回调覆盖；回调有效性以抑制后计划是否含该语义键为准，不受到达时刻影响。

---

## 三、需求分析（需求 → 代码映射与差距）

### 3.1 功能需求映射表

| 需求 | 代码实现位置 | 状态 | 分析 |
|---|---|---|---|
| FR-01 节律配置 | `domain/settings.js`（`parseScheduleInput`/`normalizeWorkBlocks`/`normalizeWeekdays`/`defaultScheduleSettings`）、`pages/settings/` | ✅ 已实现 | 智能构造器逐项校验；重叠块拒绝（`OVERLAPPING_WORK_BLOCKS`）；默认值精确匹配 PRD |
| FR-02 计划管理 | `domain/decide.js`（Enable/Disable/PauseUntil/PauseForToday/PauseForOneHour/SkipNext/ReconcilePlan）、`pages/more/` | ✅ 已实现 | 暂停以绝对 Instant + `PauseThroughLocal` 双表达；跳过以语义键表达；启动对账在 `_app-shell.bootApp` |
| FR-03 活动会话 | `domain/decide.js`（StartBreak/StartBreakNow/CompleteBreak/SkipBreak）、`pages/break-due/`、`pages/break-active/` | ✅ 已实现（含 P1-03 闭环缺口） | `endsAt = now + breakMinutes`；可见倒计时从绝对 endsAt 重算；开始/结束振动 |
| FR-04 提醒一致性 | `domain/plan.js`（`diffPlans` 指纹对账 + 迟到窗口保护）、`domain/settle.js`、`app/command-handler.js` | ◑ 一次性路径✅；**递归路径⚠** | 指纹 = `key@dueAt`（时区变化后重新注册）；迟到窗口 `dueAt+LATE_TOLERANCE_MS` 内不取消；但周规则覆盖不完整且无例外表达（P1-01/P1-02） |
| FR-05 持久化 | `domain/snapshot.js`（`migrateSnapshot` 严格解码）、`adapters/memory/memory-store.js`（乐观并发 revision） | ✅ 已实现 | 保存失败保留旧版本；损坏显式 `INVALID_SNAPSHOT`；伪造 tag 不得绕过重建 |
| FR-06 能力门禁 | `domain/policy.js`（`canEnableReliable`/`chooseSchedulingStrategy`）、`domain/settle.js` | ✅ 已实现 | 非 Supported 启用 → `PlanBlocked`；注册失败 → 保持 Enabling/转 Blocked；降级横幅显式展示 |
| FR-07 诊断 | `ports/diagnostic-port.js`、`adapters/memory/memory-diagnostics.js`、`pages/diagnostics/`、`_app-shell.diagnosticsSnapshot` | ✅ 已实现 | 只读；`readRecent` 最新优先；查询失败降级为空值不崩溃 |

### 3.2 非功能需求映射表

| 需求 | 代码实现位置 | 状态 | 分析 |
|---|---|---|---|
| NFR-01 可靠性 | `settle.js`、`command-handler.js` 提交协议、启动对账 | ✅ 架构闭环 | 真机三日内无漏报**无法验证**（Phase 3 阻塞），诚实标注 |
| NFR-02 低功耗 | `pages/break-active/index.js`（可见才刷新）、ADR-0005 | ✅ | 唯一 `setInterval` 在页面层、隐藏即停、仅做显示重算 |
| NFR-03 可恢复性 | `domain/evolve.js`（`reduceTemporalState`）、`_app-shell.refresh` | ✅ | 过期 Active → `Finished(Expired)`；过期暂停 → `PlanResumed` |
| NFR-04 可测试性 | `tests-host/`（178 用例）、`fitness.test.mjs`（FF-01~03） | ◑ | 用例齐全；**但 fitness 硬编码绝对路径、glob 不可移植（P1-04）**；分支覆盖率未量化 |
| NFR-05 圆屏交互 | `pages/*.hml` + css | ✅ 基本满足 | 主操作在中心；引导文本 ≤3 行；但 break-due/break-active 两页均无错误反馈位（P2-02） |

### 3.3 需求差距分析（本轮重点）

1. **FR-04 × 递归提醒路径存在架构级缺口**：`RecurringCalendarStrategy` 是文档首选的低注册量策略，但当前实现同时存在两个层面问题：
   - **生成层（P1-02）**：周规则从"抑制后、未来过滤、3 天视界"的期望计划折叠——视界外星期缺失（实证）、一次性例外（跳过/暂停/未来过滤）被固化为永久周规则；
   - **契约层（P1-01）**：端口对"规则"身份无定义——无 `ruleKey`、无"一规则一系统注册"的适配器语义、无单次例外表达、结算与取消均按 concrete key 运作、回调到具体键的映射未定义。**这是端口与领域身份设计问题，不是修改 `horizonDays` 能解决的。**
2. **FR-03 到期闭环有缺口（P1-03）**：归约与页面导航存在**确定性顺序错误**（保存成功时到期 tick 必然先归约后停表，不再派发/导航），且 Finished 会话无任何页面确认（`AcknowledgeBreakFinished` 命令无 UI 入口）；break-active/break-due 均无错误反馈位。
3. **NFR-04 覆盖量化缺失**：文档要求 ≥90% 业务分支覆盖，当前无覆盖率工具链配置。
4. **NFR-04 可复现性缺陷（P1-04）**：`fitness.test.mjs` 硬编码 `Z:/work/watch`；`npm test` glob 依赖 Node 21+ 或 shell 展开，README 对 Node 18 的表述在 Windows `cmd.exe` 下不可靠。

---

## 四、需求应用场景

### 场景 A：正常工作日（25/5 节律）
09:00 开始工作 → 09:25 系统提醒"该活动了"（振动 + 跳转 break-due）→ 用户点击"开始 5 分钟" → break-active 显示倒计时（从 `endsAt` 重算）→ 到期归约 → 回首页 → 下一轮 09:55……
**当前状态**：宿主全流程通过（`workflow.test.mjs`：enable→fired→active→complete→disable）；真机待验证。

### 场景 B：应用退出后（息屏/杀进程/断连）仍触发
依赖系统代理提醒 + 启动对账恢复。
**当前状态**：一次性提醒路径架构支持（绝对时间注册、启动对账、孤儿清理）；但**真机适配器不存在、探针未执行，能力 `UNKNOWN`，UI 如实显示"提醒能力未确认"**。符合 ADR-0004，不可宣称支持。

### 场景 C：修改工作时段（如改为 08:30–12:00 / 13:00–17:30）
保存 → `ConfigureSchedule` → 已启用时走 `reconcileEffects`：新期望计划与已注册集合 diff → 取消旧键、注册新键 → 持久化。
**当前状态**：已实现且测试覆盖（对账收敛、旧提醒移除）。

### 场景 D：提醒部分注册失败
适配器报告 `Partial`（部分键失败）→ `settlePlanLifecycle` 过滤 `PlanEnabled`，保持 `Enabling` → 下次对账重试缺失键并提升为 `Enabled`。
**当前状态**：已实现（`workflow.test.mjs`：partial failure visible + reconciled on retry）。
⚠ **递归路径下此场景语义未定义**：若平台按规则注册（一规则一注册），"部分失败"应按规则还是按 occurrence 报告？当前结算按 `effect.intents.length` 判定（P1-01）。

### 场景 E：存储写入失败
命令处理器：候选状态**永不**作为已提交状态返回；返回"最后一次已提交状态"，下次对账收敛；revision 不漂移，乐观并发不永久冲突。
**当前状态**：已实现（P0-01 修复 + 测试）。

### 场景 F：跨夏令时（DST）边界
日历解析逐条进行：每个未来本地时间经 `CalendarPort.resolve` 单独换算绝对 Instant（非单一当前偏移）；时区变化后指纹（key@dueAt）变化 → 重新注册。
**当前状态**：一次性路径已实现（`da488ec`，DST 边界测试存在）；**递归路径下"周规则是绝对时间还是本地日历时间"未定义**（P1-01）；真机验证待 Phase 3。

### 场景 G：自定义设置（非预设值）
设置页打开时缓存原始值（`originalBlocks`/`originalFocusMinutes`/`originalBreakMinutes`），未触碰保存不覆盖为预设。
**当前状态**：已实现（P1-09 修复 + 往返测试）。

### 场景 H：周重复策略下的隔日打开（P1-02 实证）
周三启用计划（Mon–Fri）→ 规则仅含 `{Wed,Thu,Fri}` → 周五之后再未打开应用 → **周一、周二提醒全部缺失**。
**当前状态**：**缺陷**（P1-02，探针输出见附录 A.3）。且 `workflow.test.mjs:319` 把 `['Mon','Tue','Wed']` 断言为期望值——**测试固化了该缺陷**。

### 场景 I：一次性例外被固化为永久周规则（P1-02 第二层面，未实证、纯代码推演）
- **周一 15:00 打开应用**：`buildDesiredPlan` 的 future filter 删除周一上午意图 → 即使视界改为 7 天，下一周周一上午的规则仍缺失（该日期的分钟槽被永久剔除）；
- **`SkipNext` 一次**：被跳过键从抑制后计划移除 → 该 `weekday/minute` 槽从每周规则永久消失（直到应用再次打开重建）；
- **`PauseToday`/`PauseUntil`**：暂停区间内的槽位从当天星期的规则中永久消失。
**当前状态**：**缺陷**（一次性例外与永久周规则存在语义冲突，需例外表达机制，见 P1-01/P1-02 建议）。

### 场景 J：活动到期瞬间
倒计时归零 → `BreakElapsed` → 归约 Active→Finished → 回首页。
**当前状态**：存在**确定性闭环顺序错误**（P1-03）：保存成功时，tick 内的 `refresh()` 必然先把会话归约为 Finished，ticker 随即停表且不派发/不导航，页面停留在已过期状态；此时点击"提前完成"/"跳过"命令失败，但**页面无错误展示元素，用户看到的是按钮无反应**。

---

## 五、问题清单

### 5.1 上一轮报告（Move25_Code_Review_2026-08-06.md）问题复验

| 编号 | 原问题 | 复验结果 | 证据 |
|---|---|---|---|
| P0-01 | 持久化失败仍返回成功状态 | ✅ 已修复 | `command-handler.js`：`candidateState.revision !== committedRevision` 才保存；失败返回 `commandFailed(..., state, ...)`，绝不暴露候选状态；`workflow.test.mjs` 有专项测试 |
| P0-02 | 取消提醒失败仍可持久化"已关闭" | ✅ 已修复 | `command-handler.js`：`CancelReminders` 效果失败立即 `commandFailed`，不演化/不持久化 `PlanDisabled`；`decide.js` Disabled 态孤儿清理路径 |
| P0-03 | 启动后无完整提醒对账 | ✅ 已修复 | `_app-shell.js bootApp`：probe → observeCapability → `reconcilePlan()` 全量对账（孤儿清理/补齐注册/时区重排/过期归约） |
| P0-04 | 递归规则在解释器中被丢弃 | ✅ 已修复（但见 P1-01/P1-02） | `effect-interpreter.js` 传递 `recurrenceRules`；`recording-reminder.js` 记录 `lastRecurrenceRules`；`workflow.test.mjs` 断言规则到达适配器——**规则确实到达了，但内容本身不完整（P1-02），且适配器未真正模拟"一规则一注册"（P1-01）** |
| P0-05 | 当前 HAP 无法装配核心应用 | ◑ **架构处置已修复；功能缺口仍存在** | 架构层面 ✅：`device-composition-root.js` fail-fast + `app.js` 显式错误模型"平台适配器未就绪"，不再偷偷使用内存适配器；功能层面 ❌：真实适配器仍全部缺失，产品入口只能装配 navigation，真机产品不可用（等待 Phase 3/4） |
| P1-01 | 单一 UTC 偏移不能跨 DST | ✅ 已修复 | `command-handler.js` 构造 `resolveLocal` 逐条解析事实；`decide.js` 回落偏移仅供纯领域测试 |
| P1-02 | 快照信任自声明 tag | ✅ 已修复 | `snapshot.js`：设置经 `decodeStoredSettings` 重建校验；Pause/Skip 走智能构造器；未知 tag 显式失败 |
| P1-03 | 延迟提醒容忍与对账冲突 | ✅ 已修复 | `plan.js diffPlans`：`dueAt ≤ now ≤ dueAt+LATE_TOLERANCE_MS` 的已注册项不取消 |
| P1-04 | `firedAt` 无完整校验 | ✅ 已修复 | `decide.js` HandleReminderFired：`tag/整数/isFinite` 全校验，非法返回 `INVALID_INSTANT` |
| P1-05 | `StartBreak` 不校验提醒键 | ✅ 已修复 | `decide.js`：命令键必须等于 Due 会话键，否则 `REMINDER_KEY_MISMATCH` |
| P1-06 | 先截断再生成星期规则 | ✅ 已修复（策略层） | `decide.js reconcileEffects`：先 `buildRecurrenceRules` 折叠再查容量；`REMINDER_CAPACITY_EXCEEDED`。⚠ 修复了"截断→丢整周"的顺序问题，但未解决"折叠输入本身不完整"（P1-02） |
| P1-07 | 路由适配器无异常边界 | ✅ 已修复 | `router-adapter.js`：try/catch 包裹 `router.replace`，失败返回 Err |
| P1-08 | 活动页复用 `elapsedDispatched` 不复位 | ✅ 已修复 | `break-active/index.js onShow` 每次复位 |
| P1-09 | 非预设设置被静默覆盖 | ✅ 已修复 | `settings/index.js`：`matchBlockIndex/-1` + `original*` 缓存；往返测试 |
| P1-10 | 页面失败也跳走 | ✅ 已修复 | `settings/more/break-active`：仅 `errors.length === 0` 才 `navigateTo('home')`。⚠ 跳转条件正确，但**错误在 break-active 页无展示位**（P2-02） |
| P1-11 | 诊断页显示最旧条目 | ✅ 已修复 | `diagnostics/index.js`：`readRecent` 已最新优先，正序取前 8 条 |
| P2-01 | Due/Active 页指导动作不一致 | ✅ 已修复 | `mvu/model.js guidanceFor`：Due 用 `state.guidanceIndex` 投影 |
| P2-02 | README 与代码不一致 | ◑ 基本修复 | README 已同步架构与测试描述；**测试数仍写 176，实际 178**（见 P2-03 文档漂移） |
| P2-03 | 发布元数据占位 | ⚠ 未修复（已知门禁项） | `config.json` vendor 仍为 `example`；属 Phase 7 发布门禁，README 已注明 |

### 5.2 本轮新发现问题

#### P1-01（新，升格）递归提醒注册模型契约未闭合（rule/occurrence 身份、例外表达、结算与取消语义）【架构级】

- **位置**：`ports/reminder-port.js`（`register(request)` 契约）、`app/command-handler.js`（`toRegistrationOutcome` 结算）、`adapters/memory/recording-reminder.js`、`domain/decide.js`（HandleReminderFired 回调路径）
- **证据（源码走查）**：
  1. **规则无身份**：`RecurrenceRule = { tag, weekdays, minuteOfDay, repeatKind }`——无 `ruleKey`、无对应系统注册身份、无与 concrete occurrence keys 的映射规则；
  2. **注册主体不明确**：`recording-reminder.js` 虽记录 `recurrenceRules`，但仍**逐个注册 concrete intents**，未模拟"一个规则对应一个系统注册"；契约测试也只断言规则"被传递"，未断言注册语义（`contract.test.mjs:93-114`）；
  3. **结算按 intents 而非 rules**：`toRegistrationOutcome` 用 `effect.intents.length` 判定 Partial/Failed（`command-handler.js`）——真实规则适配器报告规则级失败时无处安放；
  4. **取消无规则维度**：`cancel(keys)` 仅按 concrete key；`SkipNext`/暂停要"只取消某一次"时，无法表达"保留周规则、跳过单次 occurrence"；
  5. **回调映射未定义**：`HandleReminderFired` 期望带具体日期的语义键（`break-start:25-5:2026-08-10:565`），但适配器如何从周规则生成具体日期键（时区变化时是绝对时间还是本地日历时间）契约未规定；
  6. **`listRegistered` 返回什么未定义**：rules、occurrences，还是合成视图。
- **影响**：真实递归适配器（Phase 4）将无法在端口契约指导下实现；即使实现了，`SkipNext`/暂停/部分失败/时区变化在规则维度上的语义也无法自洽。
- **建议**（方向性，需 ADR/契约修订落地）：
  1. 为规则定义稳定身份（如 `ruleKey = recurrence:<rhythm>:<minuteOfDay>:<weekdaySetHash>`）与"一规则一注册"的系统映射；
  2. 契约显式区分**规则级操作**（按 ruleKey 注册/取消/查询）与**occurrence 级操作**（单次例外：跳过、暂停、时区重排），并定义 exception 表达（如 `ruleExceptions: [{ ruleKey, occurrenceDate, action }]`）；
  3. 结算语义按注册主体（规则或 occurrence）对齐：`RegistrationReport` 支持规则级失败；
  4. 定义周规则回调 → 具体语义键的生成规则（含 DST：以本地日历时间为准、按日解析）。
  5. 以**真实模拟"一规则一注册"的契约测试**替换当前"规则被传递即可"的断言。

#### P1-02（新，原 P1-01 深化）周规则从"抑制后/未来过滤/视界受限"计划折叠，一次性例外被固化为永久规则【已实证】

- **位置**：`domain/policy.js` `buildRecurrenceRules` + `domain/decide.js` `reconcileEffects`（`DEFAULT_HORIZON_DAYS = 3`）
- **证据（独立探针，见附录 A.3）**：周三、Mon–Fri 设置、`supportsRecurring+supportsCalendar` 实测：
  ```
  recurrenceRules count = 15
  rule weekdays union   = Fri,Thu,Wed
  intent dates          = 2026-8-5, 2026-8-6, 2026-8-7
  ```
  配置的周一/周二不在任何规则内；规则按周重复 → 周一、周二提醒在应用不再打开时**永不触发**。
- **证据（测试固化缺陷）**：`workflow.test.mjs:305-320` 断言"周一启用 → 规则 `['Mon','Tue','Wed']`"，注释写明"3-day horizon spans Mon–Wed, so the weekly rules carry exactly those weekdays"——**测试把缺陷当成了正确行为**。
- **更深问题（推演，未实证；表述已按 P1-01 收紧）**：即使视界改为 7 天，折叠输入是**已经过 `applySuppression`（暂停/跳过）与 future filter** 的计划：
  - 周一 15:00 打开：周一上午意图被 future filter 删除 → 下一周周一上午槽位不会进入**新生成的规则模板**；
  - `SkipNext` 一次：被跳过键不会进入新生成的规则模板；
  - `PauseToday`/`PauseUntil`：暂停区间槽位不会进入新生成的规则模板。
  → 一次性例外会**污染生成出的永久规则模板**。真实设备上的最终表现取决于 P1-01 中尚未定义的适配器替换语义：可能是**规则槽位缺失、旧规则残留或重复注册**——即"未定义且高风险"，而非唯一确定的"永久消失"。一次性例外与永久周规则的语义冲突仍需例外表达机制解决（承接 P1-01）。
- **建议**：规则生成与"当前实例化"解耦——规则模板从**完整配置**（`settings.weekdays` + 完整周枚举）推导；一次性例外（skip/pause/未来过滤）作为**规则之外的 occurrence 级抑制**表达（P1-01）；补性质测试"规则星期并集 ⊇ 配置星期"与"例外不得进入规则模板"。

#### P1-03（原 P1-02，现象描述修正）到期归约与页面导航顺序错误（确定性缺陷，非竞态）

- **位置**：`pages/break-active/index.js` `startVisibleTicker`；`pages/mvu/update.js`（`AckFinishedPressed` 无任何页面派发）；`domain/decide.js`（`CompleteBreak`/`SkipBreak` 均不接受 `Finished`）
- **机理**（代码走查；v2.2 修正定性）：
  1. ticker 每次 tick 先 `refresh()`——`refresh()` 执行 `reduceTemporalState`：`now >= endsAt` 时会话归约为 `Finished(Expired)` 并持久化；
  2. ticker 随后读到 `model.breakStatus !== 'Active'` → `stopVisibleTicker()` 返回，**不再派发 `BreakElapsed`、不导航**；
  3. 只要快照保存成功，上述 1→2 是**每次到期 tick 的确定性正常路径**，而非两个异步操作随机争用的竞态（仅在保存失败等异常分支下才表现出边界竞争）——缺陷定性应为"**归约与导航闭环顺序错误**"；
  4. 页面停留显示 00:00；此时点击"提前完成"→ `CompleteBreak` 要求 Active → `INVALID_STATE_TRANSITION`；点击"跳过"→ 同样失败；
  5. **用户表现（v2.0 曾误述为"报操作失败"，v2.1 起修正）**：`break-active/index.hml` **没有任何错误展示元素**，`onComplete`/`onSkip` 失败后也不重新渲染——**用户看到的是按钮无反应**；
  6. 全局没有任何页面派发 `AcknowledgeBreakFinished`，`Finished` 会话只能等下一次有效回调覆盖，无主动清理路径。
- **影响**：用户被卡在过期页面（`break-active.hml` 甚至没有返回按钮），且无任何可见反馈。
- **建议**：到期检测以 `endsAt` 绝对时间为主——到期即派发 `BreakElapsed`（由命令处理器归约），成功后再导航；或归约后页面呈现"已结束"态并派发 `AcknowledgeBreakFinished`；`break-active.hml` 增加返回入口与错误展示位；补页面复用测试（第二次活动到期仍能导航）。

#### P1-04（新）测试工具链可复现性缺陷：fitness 硬编码绝对路径 + glob 可移植性【工程证据链 P1，非生产运行时 P1】

- **位置**：`tests-host/fitness.test.mjs:6`；`package.json` scripts.test；`README.md` 测试章节
- **证据**：
  1. `const ROOT = resolve('Z:/work/watch');` —— 硬编码本机磁盘路径。后果：a) 在其他目录检出时测试直接失败；b) 若 `Z:/work/watch` 存在另一份旧检出，FF-01~03 可能检查**错误源码**，"领域层零平台依赖"的证明不再可靠；c) CI/Linux/macOS 不可复现；
  2. `"test": "node --test entry/src/main/js/MainAbility/tests-host/*.test.mjs"` —— glob 依赖 Node 21+ 的原生展开或 shell 展开；README 声称"Node 18+ 直接运行该命令"在 Windows `cmd.exe`（不展开 glob、Node 18 无原生 glob）下不可靠（本机实测环境为 Node v24.14.1，glob 由 Node 自身展开，因此通过）。
- **影响**：架构适应度（FF-01~03）是本报告"领域纯净性持续守护"论断的依据，其自身不可复现会动摇整个证据链。
- **严重度标准（v2.2 明确）**：从**生产运行时**看（不直接导致用户数据损坏、真机漏报或生产 HAP 异常）更接近 P2；但从**审计证据链、CI 门禁与架构适应度可信度**看定为 P1——FF-01~03 是本报告大量架构结论的自动化依据，且硬编码路径存在"检查错误源码副本而显示通过"的隐蔽失效模式。本报告按后者定级，读者应明确其性质为工程证据链 P1。
- **建议**：
  1. `fitness.test.mjs` 改为从 `import.meta.url` 推导仓库根（如 `resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)))`），严禁写死开发者路径；
  2. 测试命令改为跨版本形式：目录参数（`node --test entry/src/main/js/MainAbility/tests-host/`，Node 18.13+ 支持目录递归）或 Node 21+ 带引号 glob；
  3. README 更新可复现命令与版本要求；CI 加入"干净检出 + 指定 Node 版本"的证据输出（TAP/JUnit + 退出码 + commit SHA）。

#### P2-01（已撤回）原"`SkipNext` 被提醒列表过度阻塞"判断不成立

- **撤回理由（代码证据）**：`domain/decide.js` `SkipNext` 分支末尾：
  ```js
  const provisional = Object.assign({}, state, { skip: { tag: 'SkipReminder', reminderKey: next.key } });
  return reconcileEffects(provisional, factsValue, [nextReminderSkipped(next.key)]);
  ```
  而 `reconcileEffects` 执行：
  ```js
  const registered = facts.registeredPlan || emptyPlan();
  ...
  const diff = diffPlans(desired, registered, nowMs);
  ```
  即当前实现以"完整对账"实现跳过——**要取消已注册的"下一次提醒"（并避免误重注册其他键），必须知道实际注册集合**。壳层读取注册表是 `diffPlans` 语义的一部分，不是无意义依赖。直接移除将导致 `registeredPlan` 默认为空、被跳过提醒无法取消、其余提醒被错误重注册。
- **处置**：从问题清单删除。若产品希望"注册表查询失败时仍允许跳过"，应重新设计为**基于稳定注册身份的定向取消**（与 P1-01 规则/occurrence 身份模型一并设计），而非删除事实依赖。此设计说明并入 5.2 的注意点（见第八章第 10 条）。

#### P2-02（原 P2-02，范围扩展）break-due 与 break-active 两页均无错误反馈位

- **位置**：`pages/break-due/index.hml`、`pages/break-active/index.hml`（均无 `error` 元素）；对应 `index.js` 失败后不渲染
- **分析**：`StartDuePressed`（键不匹配/状态迁移失败）与 `CompletePressed`/`SkipBreakPressed`（Finished 态失败）返回 Err 后，错误进入全局 UiModel，但这两页无展示位——用户看到按钮无反应。对比 home/more/settings 均有 `hasError/errorText`。
- **建议**：两页各补一行错误展示（≤2 行文案，符合圆屏约束），并让失败 handler 触发重渲染。

#### P2-03（原 P2-03）文档漂移（docs ↔ code）

| 文档 | 文档内容 | 代码实际 | 建议 |
|---|---|---|---|
| `architecture/11_PORT_CONTRACTS.md` | CalendarPort：`today(instant)`/`weekday(localDate)`/`resolve(...)` | `utcOffset(instant)`/`localWall(instant, offset)`/`resolve(...)` | 以代码为准更新文档（`localWall` 返回 `{localDate, minuteOfDay}`） |
| `domain/03_UBIQUITOUS_LANGUAGE.md` | 事件 `PlanPausedUntil`/`BreakCompleted`/`ReminderPlanComputed` | `PlanPaused`/`BreakFinished`/`PlanReconciled` | 同步事件目录 |
| `domain/05_FUNCTIONAL_DOMAIN_MODEL.md` | 效果含 `PersistSnapshot(snapshot)` | 持久化非效果，由命令处理器结算后直存（`effects.js` 注释明确） | 更新效果目录并说明理由 |
| `delivery/25_REPOSITORY...` | 目录含 `workflows/` 层 | 无 `workflows/` 目录（工作流体现于 `app/command-handler.js` + `decide` 管道） | 更新目录规范 |
| `README.md` | "176 个宿主测试" | 实际 **178**（附录 A 原始输出） | 改为动态表述或更新数字 |
| `domain/08_STATE_MACHINES.md` | `Active → Finished: SkipBreak` 未列（仅 `Due → Finished: SkipBreak`） | 代码允许 Active 态跳过（`SkipBreak` 接受 Due 与 Active） | 若是设计使然，更新状态机文档 |

#### P2-04（原 P2-04）死代码 / 无用资产

- `pages/mvu/model.js`：`route: state.route || 'home'`——`DomainState` 无 `route` 字段，恒为 `'home'`；
- `app/command-handler.js`：`listFailure` 变量在 Ok 结果中恒为 `undefined`（Err 路径已提前返回）；
- `i18n/zh-CN.json`、`i18n/en-US.json`：全仓无任何 import/引用（页面文案硬编码中文，且不在 `$string` 资源中）。Lite FA 对 `i18n/` 目录的加载语义需确认，若确定无用应删除或接入 `$string` 资源（`resources/base/element/string.json`）。

#### P3-01 `sessionId` 使用 `'break-' + now.epochMilliseconds`

- **位置**：`domain/decide.js` `startActiveBreak`
- **分析**：同一毫秒内两次开始会碰撞（概率极低）；且 sessionId 含时钟值（实为事实值派生，可接受）。建议改用单调计数器（如 `revision + 1`）或 `break-<revision>-<seq>`。

#### P3-02 `HandleReminderFired` 过早/迟到回调返回 Err，会以通用错误进入 UiModel

- **位置**：`domain/decide.js`（`REMINDER_FIRED_TOO_EARLY`/`STALE_REMINDER_CALLBACK`）
- **分析**：文档 `18_ERROR_MODEL` 时间异常策略为"记录并按容差决定/只记录过期"；当前实现把系统回调异常升级为命令失败 → 错误进入 UiModel（当前无页面展示位，见 P2-02；未来接入错误横幅后会是"操作失败"）。建议：回调路径的此类异常转入诊断 + 显式提示，而非通用错误（待 Phase 4 回调适配器接入时一并处理）。

#### P3-03 `Enabling` 期间允许产生 `Due`

- **位置**：`domain/decide.js` HandleReminderFired 守卫允许 `Enabling`
- **分析**：注册尚未完成时理论不应有回调；若适配器对同键重注册立即回调（部分平台行为），会提前弹窗。低风险，可加"仅 `Enabled`/`Paused`"守卫或保持现状并记录。

### 5.3 值得肯定（本轮确认的架构优点）

1. **函数式核心边界干净**：`domain/` 零平台依赖由 FF-01 守护（注：守护测试本身有可复现性缺陷 P1-04，本结论依据的是本次审阅对源码的直接阅读与抽查，而非仅凭测试）；
2. **提交协议严谨**：持久化失败绝不暴露候选状态、revision 不漂移（乐观并发不会永久冲突）；专项测试覆盖；
3. **结算门禁**：`settlePlanLifecycle` 把"注册结果"作为 `PlanEnabled` 的准入条件，全失败转 `PlanBlocked`、部分失败保持 `Enabling`——"已启用"三个字不再可能欺骗用户；
4. **回调幂等三规则**与 2026-08-06 文档修订完全一致（重复/跨键/禁用后回调不覆盖会话）；
5. **迟到窗口保护**：`diffPlans` 在 `dueAt+LATE_TOLERANCE_MS` 内不取消已注册提醒，避免"对账吃掉即将送达的回调"；
6. **测试体系完备**：178 用例含性质测试、随机命令序列模型走查、端口契约、迁移、UI 投影、架构适应度，全部通过（证据见附录 A）；
7. **诚实呈现能力**：真机适配器未确认前，产品入口显示"平台适配器未就绪"，绝不假装支持。

---

## 六、后端具体修改代码及行间代码注释

> 本节为当前提交状态下（`72019dc` 及此前系列提交）的核心后端代码，带行间审阅注释。注释以 `// →` 开头区分于源码注释。代码与 `entry/src/main/js/MainAbility/` 一致。

### 6.1 `domain/decide.js`（决策核心，626 行）——关键流程

```js
export function decide(state, command, facts) {
    if (!command || typeof command.tag !== 'string') {
        return err(domainError(ERROR_CODES.UNKNOWN_COMMAND, command));   // → 入口穷尽分支：未知命令显式错误（文档 05 第 4 层防线）
    }
    const factsValue = facts || {};

    switch (command.tag) {
        case 'ConfigureSchedule': {
            const parsed = command.input && command.input.tag === 'ScheduleSettings'
                ? ok(command.input)                                       // → 已构造值直接复用；否则走智能构造器
                : parseScheduleInput(command.input);
            if (parsed.tag === 'Err') {
                return parsed;                                            // → 非法输入 fail-fast（文档 06 失败策略）
            }
            const provisional = Object.assign({}, state, { settings: parsed.value });
            if (state.planLifecycle.tag === 'Enabled' || state.planLifecycle.tag === 'Paused') {
                const localWallResult = missingFact(factsValue, 'localWall');
                if (localWallResult.tag === 'Err') {
                    return localWallResult;
                }
                return reconcileEffects(provisional, factsValue, [scheduleConfigured(parsed.value)]);
                // → 已启用时改设置 = 重算期望计划 + 对账（FR-02：设置变更后提醒重新对账）
            }
            return decideSnapshot(provisional, [scheduleConfigured(parsed.value)]);
        }

        case 'EnablePlan': {
            const capabilityCheck = assertCanEnableReliable(state.capability);
            if (capabilityCheck.tag === 'Err') {
                // → 能力非 Supported：绝不进入 Enabled，转 PlanBlocked + 诊断（FR-06 / 不变量 10）
                return decideSnapshot(state, [planBlocked(capabilityCheck.error)], [
                    emitDiagnostic({ tag: 'CapabilityBlocked', code: capabilityCheck.error.code, at: factsValue.now })
                ]);
            }
            ...
            if (state.planLifecycle.tag === 'Enabled') {
                return reconcileEffects(state, factsValue, []);           // → 幂等启用：仍对账收敛注册表
            }
            const provisional = Object.assign({}, state, {
                planLifecycle: { tag: 'Enabled' },                        // → 临时置 Enabled，最终由 settle 门禁裁决
                settings: Object.freeze(Object.assign({}, state.settings, { enabledFlag: true }))
            });
            return reconcileEffects(provisional, factsValue, [planEnableRequested(), planEnabled()]);
        }

        case 'SkipNext': {
            ...
            const next = firstFutureIntent(withoutSkip, localWallResult.value.localDate, localWallResult.value.minuteOfDay);
            if (!next) {
                return err(domainError(ERROR_CODES.NOTHING_TO_SKIP, null));
            }
            const provisional = Object.assign({}, state, {
                skip: { tag: 'SkipReminder', reminderKey: next.key }
            });
            return reconcileEffects(provisional, factsValue, [nextReminderSkipped(next.key)]);
            // → 以完整对账实现跳过：reconcileEffects 消费 facts.registeredPlan 做 diffPlans，
            //   因此 SkipNext 依赖注册表事实（v2.0 曾误判为过度依赖，已撤回——见 P2-01 撤回说明）
        }

        case 'HandleReminderFired': {
            ...
            // → 幂等性：Due/Active 期间到达的回调（重复/跨键）只记诊断，不覆盖会话（文档 08 修订规则 1）
            if (state.breakSession.tag === 'Due' || state.breakSession.tag === 'Active') {
                return decideSnapshot(state, [], [
                    emitDiagnostic({ tag: 'DuplicateReminderIgnored', reminderKey: keyValue, sessionTag: state.breakSession.tag, at: firedAt })
                ]);
            }
            const suppressedResult = buildSuppressedPlan(state, factsValue);
            ...
            const intent = findIntentByKey(suppressedResult.value, keyValue);
            if (!intent) {
                // → 抑制后计划中无此键（已跳过/已暂停/跨日）：忽略 + 诊断（文档 08 修订规则 4）
                return decideSnapshot(state, [], [
                    emitDiagnostic({ tag: 'StaleReminderIgnored', reminderKey: keyValue, at: firedAt })
                ]);
            }
            // → 过早/迟到容差（EARLY/LATE_TOLERANCE_MS 为 INFERRED，需 GT6 探针标定）
            if (intent.dueAt && intent.dueAt.tag === 'Instant') {
                const delta = firedAt.epochMilliseconds - intent.dueAt.epochMilliseconds;
                if (delta < -EARLY_TOLERANCE_MS) { return err(...REMINDER_FIRED_TOO_EARLY...); }
                if (delta > LATE_TOLERANCE_MS) { return err(...STALE_REMINDER_CALLBACK...); }
                // → P3-02：此类回调异常升级为命令失败，未来接入回调适配器时建议转诊断+显式提示
            }
            return decideSnapshot(state, [breakBecameDue(intent.key, firedAt)], [
                vibrate('BreakStart'),
                navigate('break-due')                                     // → 效果描述：振动 + 导航由解释器执行（规则 3）
            ]);
        }

        case 'StartBreak': {
            ...
            // → P1-05 修复：命令键必须等于 Due 会话键，杜绝陈旧页面/双击启动错误会话
            if (commandKey !== expectedKey) {
                return err(domainError(ERROR_CODES.INVALID_STATE_TRANSITION, Object.freeze({
                    reason: 'REMINDER_KEY_MISMATCH', expected: expectedKey, actual: commandKey
                })));
            }
            return startActiveBreak(state, factsValue, state.breakSession.reminderKey, true);
            // → acknowledged=true：提醒页已振动过，不再重复 BreakStart 振动（b237f46）
        }
        ...
    }
}
```

```js
function reconcileEffects(state, facts, extraEvents) {
    const desiredResult = buildDesiredPlan(state, facts);                 // → 3 天视界期望计划（DEFAULT_HORIZON_DAYS=3）
    ...
    const strategyResult = chooseSchedulingStrategy(state.capability, desired);
    if (strategyResult.tag === 'Ok') {
        strategy = strategyResult.value;
        desired = applyStrategyWindow(desired, strategy, facts.now);      // → 按能力选择注册策略（文档 09 能力驱动策略）
    }
    const registered = facts.registeredPlan || emptyPlan();               // → SkipNext 等命令经此消费注册表事实
    ...
    const diff = diffPlans(desired, registered, nowMs);                   // → 指纹（key@dueAt）对账
    const events = (extraEvents || []).concat([planReconciled(diff)]);
    ...
    const rules = strategy && strategy.tag === 'RecurringCalendarStrategy'
        ? buildRecurrenceRules(desired)                                   // ⚠ P1-02：折叠输入 = 抑制后/未来过滤/3天视界计划
        : undefined;                                                      //   一次性例外被固化为永久周规则（已实证）
    if (rules && typeof strategy.maxPendingCount === 'number' &&
        rules.length > strategy.maxPendingCount) {
        // → P1-06 修复：先折叠规则再查容量，避免先截断丢失整周（Mon–Fri）
        return err(domainError(ERROR_CODES.REMINDER_CAPACITY_EXCEEDED, ...));
    }
    const effects = [
        cancelReminders(diff.toCancel),
        registerReminders(diff.toRegister, rules)
    ];
    return ok(decision(events, effects));
}
```

### 6.2 `domain/plan.js`（计划代数）——对账与迟到保护

```js
export function diffPlans(desiredPlan, registeredPlan, nowMs) {
    const desired = combinePlans([], desiredPlan);
    const registered = combinePlans([], registeredPlan);
    const toRegister = desired.filter(function (intent) {
        return !containsFingerprint(registered, intentFingerprint(intent));
    });
    const toCancel = registered.filter(function (intent) {
        if (containsFingerprint(desired, intentFingerprint(intent))) {
            return false;
        }
        if (typeof nowMs === 'number' && isFinite(nowMs)) {
            const dueAt = intent && intent.dueAt && intent.dueAt.tag === 'Instant'
                ? intent.dueAt.epochMilliseconds : null;
            if (dueAt !== null && dueAt <= nowMs && nowMs <= dueAt + LATE_TOLERANCE_MS) {
                // → P1-03 修复：已到期且在迟到窗口内不取消，防止对账吃掉即将送达的回调
                return false;
            }
        }
        return true;                                                      // → 未来日期遗留（跳过/暂停/改设置）立即取消
    }).map(function (intent) {
        return intent.key.value;
    });
    ...
}
```

```js
export function intentFingerprint(intent) {
    // → 时区/时钟变化后，同一本地键映射到不同绝对时刻：指纹 = key@dueAt（da488ec）
    const dueAt = intent && intent.dueAt && intent.dueAt.tag === 'Instant'
        ? intent.dueAt.epochMilliseconds : 0;
    return (intent.key.value || '') + '@' + dueAt;
}
```

### 6.3 `domain/policy.js`（能力门禁与策略）——P1-01/P1-02 缺陷点

```js
export function buildRecurrenceRules(plan) {
    const byMinute = {};
    const order = [];
    for (let index = 0; index < (plan || []).length; index += 1) {
        const intent = plan[index];
        ...
        const minute = intent.at.value;
        if (!byMinute[minute]) { byMinute[minute] = { weekdays: {} }; order.push(minute); }
        byMinute[minute].weekdays[dayResult.value.value] = true;
        // ⚠ P1-02：星期集合来自"调用方喂入的计划"采样——该计划已经过 3 天视界限制、
        //   未来过滤与暂停/跳过抑制。周规则因此：a) 覆盖不了视界外星期（实证：周三启用仅得
        //   {Wed,Thu,Fri}，周一/周二永不触发）；b) 把一次性例外固化为永久规则（SkipNext/
        //   PauseToday/周一上午 future-filter 会永久剔除对应 weekday/minute 槽位）。
        //   规则模板应从完整配置（settings.weekdays + 完整周枚举）推导，例外走 occurrence 级表达（P1-01）。
    }
    ...
}
```

### 6.4 `domain/settle.js`（生命周期结算门禁）

```js
export function settlePlanLifecycle(state, events, registration) {
    ...
    if (hasEnable && !registration) {
        // → 壳层丢失效果报告 = 壳层缺陷，绝不静默成功（MISSING_REGISTRATION_OUTCOME）
        return err(domainError(ERROR_CODES.MISSING_REGISTRATION_OUTCOME, ...));
    }
    if (!registration || registration.tag === 'Registered') {
        if (hasEnable || !awaiting) { return ok(list); }
        return ok(list.concat([planEnabled()]));                          // → 后续 ReconcilePlan 补齐注册 → 提升为 Enabled
    }
    if (registration.tag === 'Partial') {
        // → 部分失败：过滤 PlanEnabled，保持 Enabling，下次对账重试缺失键（FR-04）
        return ok(hasEnable ? list.filter(e => e.tag !== 'PlanEnabled') : list);
    }
    // → 全失败：以 PlanBlocked 替换 PlanEnabled——UI 绝不显示假的"已启用"
    const blocked = planBlocked(domainError(ERROR_CODES.REMINDER_REGISTRATION_FAILED, {...}));
    ...
}
// ⚠ P1-01 关联：registration 的 Partial/Failed 判定来自 toRegistrationOutcome（按 intents 计数）。
//   真实规则适配器若按规则注册，结算语义需按规则主体重新定义。
```

### 6.5 `domain/snapshot.js`（严格解码与迁移）

```js
function decodeStoredSettings(raw) {
    ...
    return parseScheduleInput({                                          // → P1-02 修复：自声明 tag 不可信，
        enabledFlag: raw.enabledFlag === true,                           //   每个值重新走智能构造器校验
        weekdays: raw.weekdays.map(primitiveOf),                         //   primitiveOf 提取 {tag,value} 载荷
        workBlocks: raw.workBlocks.map(function (block) {
            return { start: primitiveOf(block && block.start), end: primitiveOf(block && block.end) };
        }),
        focusMinutes: primitiveOf(raw.rhythm.focusMinutes),
        breakMinutes: primitiveOf(raw.rhythm.breakMinutes),
        version: primitiveOf(raw.version)
    });
}
```

```js
export function migrateSnapshot(raw) {
    ...
    if (version === undefined || version === null) {
        // → 无版本号：显式失败，绝不静默回退默认（文档 15：不允许"解析失败恢复默认"而不告知）
        return err(domainError(ERROR_CODES.INVALID_SNAPSHOT, { reason: 'missing_schema_version', raw }));
    }
    ...
    // 未来：while (version < CURRENT) { raw = migrateStep(raw, version); version += 1; }  ← 阶梯迁移预留
}
```

### 6.6 `app/command-handler.js`（命令处理器：事实收集 + 提交协议）

```js
function commandNeedsRegisteredPlan(command) {
    switch (command && command.tag) {
        case 'EnablePlan': case 'DisablePlan': case 'ConfigureSchedule':
        case 'PauseUntil': case 'PauseForToday': case 'PauseForOneHour':
        case 'SkipNext': case 'ReconcilePlan':
            // → v2.1 修订：SkipNext 保留在此——其实现经 reconcileEffects/diffPlans 消费注册表
            //   事实（对账语义的一部分），不属于过度依赖（原 P2-01 已撤回，见 5.2 撤回说明）
            return true;
        default: return false;
    }
}
```

```js
export function createCommandHandler(ports) {
    ...
    return function handleCommand(state, command, options) {
        const clockResult = ports.clock.now();                              // → 时钟经端口取得，领域不见平台
        ...
        // → P1-01（旧编号）修复：逐条日历解析事实，DST 边界每个未来本地时间单独换算
        const resolveLocal = function (localDateValue, minuteOfDayValue) {
            return ports.calendar.resolve(localDateValue, minuteOfDayValue);
        };
        const facts = Object.freeze({
            now, localWall: wallResult.value, utcOffsetMinutes: offsetResult.value,
            registeredPlan, horizonDays: DEFAULT_HORIZON_DAYS, resolveLocal
        });
        ...
        // 4) Persist（壳层拥有，结算后）：
        const committedRevision = state.revision;                           // → P0-01 修复核心：期望修订 = 已提交修订
        if (candidateState.revision !== committedRevision) {                //    归约是确定性的，失败后重跑，revision 不漂移
            const persist = ports.store.saveSnapshot(committedRevision, createSnapshot(candidateState));
            ...
            if (persist.tag === 'Err') {
                return commandFailed(persist.error, state, decision, results, facts, candidateState);
                // → 失败返回"已提交状态"，绝不暴露候选状态（乐观并发不永久冲突）
            }
        }
        return { tag: 'Ok', state: candidateState, ... };
    };
}
```

```js
function toRegistrationOutcome(result, intents) {
    ...
    const total = (intents || []).length;                                  // ⚠ P1-01：结算按 concrete intents 计数；
    if (failed.length > 0 && registeredCount > 0 && failed.length < total) //   真实规则适配器按规则注册时，
        return { tag: 'Partial', failedKeys: failed };                     //   Partial/Failed 语义需按规则主体定义
    ...
}
```

### 6.7 `app/effect-interpreter.js` + `adapters/memory/recording-reminder.js`（效果解释与语义键幂等）

```js
// effect-interpreter.js
case 'RegisterReminders':
    return ports.reminders.register(Object.freeze({
        intents: effect.intents,
        recurrenceRules: effect.recurrenceRules || Object.freeze([])        // → P0-04 修复：规则必须到达适配器
    }));
```

```js
// recording-reminder.js —— 语义键幂等：同键重注册不重复、但更新 dueAt、系统 id 稳定
if (registry.has(key)) {
    registry.set(key, { systemId: registry.get(key).systemId, intent: intent });   // → 时区变化重注册同键：保留系统 id
    ...
}
// ⚠ P1-01：本适配器记录 recurrenceRules 但仍逐个注册 concrete intents，
//   未模拟"一规则一系统注册"；契约测试（contract.test.mjs）也只断言规则"被传递"。
```

### 6.8 `ports/reminder-port.js`（契约文档化）

```js
// → 契约要点（与文档 11 一致）：语义键幂等；部分失败逐项报告；系统 id 是适配器数据、
//   领域身份永远是语义键；适配器不得用 JS 长定时器实现提醒。
// register(request)：request = { intents, recurrenceRules }（v1 演进：带规则字段）
// ⚠ P1-01：契约未定义——规则的稳定身份（ruleKey）、"一规则一注册"的注册主体、
//   规则级取消、单次例外表达、周规则→具体日期回调键的生成规则（含 DST 语义）、
//   listRegistered 对规则的返回视图。真实递归适配器无法在此契约指导下实现。
```

---

## 七、前端具体修改代码及行间代码注释

> 本节为当前提交状态下的核心前端（页面/壳层）代码，带行间审阅注释。

### 7.1 `pages/_app-shell.js`（页面壳：装配、引导、派发、刷新）

```js
function bootApp(instance) {
    const bootResult = instance.boot();
    if (bootResult.tag === 'Err') {
        model = Object.freeze(Object.assign({}, initialUiModel(), {
            errors: Object.freeze([{ text: '快照损坏或无法读取', code: bootResult.error.code }])
        }));                                                              // → 损坏快照显式报错，不回退默认（FR-05）
        return null;
    }
    ...
    // → P0-03 修复：启动对账 = 孤儿清理 + 补齐注册 + 时区重排 + 过期归约
    const reconciled = instance.handleCommand(state, reconcilePlan());
    if (reconciled.tag === 'Ok') {
        state = reconciled.state;
        model = projectModel(state, reconciled.facts, bootErrors);
    } else { ... }
    return state;
}
```

```js
export function dispatch(msg) {
    if (!app || !state) { return model; }
    const pure = pureUpdate(model, msg);                                   // → MVU：先纯 update（ADR-0006）
    model = pure.model;
    const commands = pure.commands || [];
    for (...) {
        const result = app.handleCommand(state, commands[index]);          // → 命令处理器执行（决策+效果+结算+持久化）
        if (result.tag === 'Ok') {
            state = result.state;
            if (result.facts) { model = projectModel(state, result.facts); }
        } else {
            model = Object.freeze(Object.assign({}, model, {
                errors: model.errors.concat([{ text: '操作失败', code: result.error && result.error.code }])
            }));                                                            // → 失败进入 UiModel；是否可见取决于页面有无展示位
        }
    }
    return model;
}
```

```js
export function refresh() {
    ...
    // → 页面可见时的归约 + 持久化：与命令处理器同样以"预归约修订"为期望修订
    const baseRevision = state.revision;
    const reduced = reduceTemporalState(state, clockResult.value);
    if (reduced.tag === 'Ok' && reduced.value !== state) {
        const persist = app.ports.store.saveSnapshot(baseRevision, createSnapshot(candidateState));
        if (persist.tag === 'Ok') { state = candidateState; }              // → 只有持久化成功的归约才成为全局状态
        else { ... }                                                        // → 失败：诊断 + 错误提示，revision 不动
    }
    ...
}
```

### 7.2 `pages/mvu/update.js`（MVU 纯更新）

```js
export function update(model, msg) {
    ...
    case 'StartDuePressed':
        return { model, commands: msg.reminderKey ? [startBreak(msg.reminderKey)] : [startBreakNow()] };
        // → 带上 Due 页的语义键，交给领域校验（P1-05）
    case 'BreakElapsed':
        return { model, commands: [reconcilePlan()] };
        // → 可见倒计时归零：由命令处理器的归约以绝对时间裁决，不信任页面（ADR-0005）
    case 'TickVisible':
        const remaining = model.endsAtEpochMs > 0 && typeof msg.now === 'number'
            ? Math.max(0, Math.floor((model.endsAtEpochMs - msg.now) / 1000))   // → 从绝对 endsAt 重算（不累计递减，防漂移）
            : model.remainingSeconds;
        return { model: withModel(model, { remainingSeconds: remaining }), commands: [] };
    ...
}
// → AckFinishedPressed 消息存在，但无任何页面派发（P1-03：Finished 会话无确认路径）
```

### 7.3 `pages/mvu/model.js`（纯投影）

```js
export function projectModel(state, facts, errors) {
    ...
    if (session && session.tag === 'Active' && facts && facts.now) {
        endsAtEpochMs = session.endsAt.epochMilliseconds;
        remainingSeconds = Math.max(0, Math.floor((endsAtEpochMs - facts.now.epochMilliseconds) / 1000));
        // → 倒计时永远是 endsAt − now 的投影；页面隐藏后停止刷新（17_LOW_POWER）
    }
    ...
    // → P2-01（旧编号）修复：Due 提示用 state.guidanceIndex 投影，与 startActiveBreak 的选择一致
    if (session.tag === 'Due') {
        const item = guidanceAt(guidanceIndex);
        return Object.freeze({ id: item.id, actions: item.actions });
    }
    ...
}
```

### 7.4 `pages/settings/index.js`（自定义设置保留）

```js
restoreFromModel() {
    ...
    // → P1-09 修复：打开时缓存原始值；非预设匹配返回 -1，保存时回退原值
    this.originalBlocks = (summary.rawBlocks || []).map(b => ({ start: b.start, end: b.end }));
    this.originalFocusMinutes = summary.focusMinutes;
    this.originalBreakMinutes = summary.breakMinutes;
    const blockIndex = matchBlockIndex(summary.blocks, BLOCK_PRESETS);     // → 自定义值不映射到第一个预设
    ...
}
onSave() {
    ...
    const workBlocks = this.selectedBlock >= 0 ? BLOCK_PRESETS[this.selectedBlock] : this.originalBlocks;
    const rhythm = this.selectedRhythm >= 0 ? RHYTHM_PRESETS[this.selectedRhythm]
        : { focus: this.originalFocusMinutes, break: this.originalBreakMinutes };
    ...
    const errors = nextModel.errors || [];
    if (errors.length === 0) { navigateTo('home'); return; }               // → P1-10：仅全部成功才离页
    this.hasError = true; this.errorText = ...;
}
```

### 7.5 `pages/break-active/index.js`（可见倒计时 + P1-03 顺序错误点）

```js
onShow() {
    this.elapsedDispatched = false;                                        // → P1-08 修复：页面复用后允许再次派发到期
    this.render();
    this.startVisibleTicker();
},
startVisibleTicker() {
    ...
    this.timerId = setInterval(function () {
        const model = refresh();                                           // ⚠ P1-03：保存成功时 refresh 必然先归约
                                                                           //   Active→Finished——确定性顺序，非竞态
        self.remainingText = formatSeconds(model.remainingSeconds);
        if (model.breakStatus !== 'Active') {
            self.stopVisibleTicker();                                      // → 归约已发生：停表，不再派发/导航 → 页面停留
            return;                                                        //   且按钮点击失败无可见反馈（HML 无 error 元素）
        }
        if (model.remainingSeconds === 0 && !self.elapsedDispatched) {
            self.elapsedDispatched = true;
            const nextModel = dispatch({ tag: 'BreakElapsed' });
            self.stopVisibleTicker();
            if ((nextModel.errors || []).length === 0) { navigateTo('home'); }   // → 失败不跳走（P1-10）
        }
    }, 1000);
},
// ⚠ onComplete/onSkip：dispatch 后不检查结果、不渲染错误 → 失败时按钮无反应（P2-02）
```

### 7.6 `pages/more/index.js`（二级操作页）

```js
function dispatchThenHome(message) {
    const nextModel = dispatch(message);
    const errors = nextModel.errors || [];
    if (errors.length > 0) { return false; }                               // → P1-10：暂停/跳过失败留在本页展示错误
    navigateTo('home');
    return true;
}
```

### 7.7 `pages/home/index.js`（首页：主操作 + 能力横幅）

```js
render() {
    const model = refresh();
    this.capabilityText = model.capabilityBanner.text;                     // → 能力横幅显式呈现（降级不得静默）
    this.planStatusText = statusText(model.planStatus);                    // → Disabled/Enabling/Enabled/Paused/Blocked
    this.nextBreak = model.nextBreakText;
    ...
}
onToggle() {
    const model = refresh();
    if (model.planStatus === 'Enabled' || model.planStatus === 'Paused') {
        dispatch({ tag: 'DisablePressed' });
    } else { dispatch({ tag: 'EnablePressed' }); }
    this.render();
}
```

### 7.8 `adapters/ui/router-adapter.js`（平台路由适配器）

```js
export function createRouterAdapter() {
    return {
        navigate(route) {
            const uri = ROUTE_TO_URI[route];
            if (!uri) { return Err(UNKNOWN_ROUTE); }
            try {
                router.replace({ uri: uri });                              // → P1-07 修复：异常边界，平台失败不穿透
                return ok(Object.freeze({ tag: 'Unit' }));
            } catch (error) { return Err(NAVIGATION_FAILED); }
        }
    };
}
// → 全仓唯一的 @system.* 导入点（适配器层，符合六边形规则）
```

### 7.9 `tests-host/fitness.test.mjs`（架构适应度——P1-04 缺陷点）

```js
const ROOT = resolve('Z:/work/watch');                                     // ⚠ P1-04：硬编码本机绝对路径
// → 应改为从 import.meta.url 推导仓库根（fileURLToPath(new URL('../../../../../../', import.meta.url))），
//   否则换目录检出时 FF-01~03 可能检查错误源码或直接失败；CI 亦不可复现
```

---

## 八、注意点

1. **不要把"178 个宿主测试全绿"当作真机可靠性证据**。宿主测试证明一次性路径的领域正确性；息屏/杀进程/断连/重启/功耗必须等 GT6 探针（G0–G7）与三日 A/B 实测，证据等级 `DEVICE_CONFIRMED` 之前产品承诺一律保持 `UNKNOWN`（README 已正确呈现）。
2. **递归提醒路径（RecurringCalendarStrategy）当前不可用于生产（P1-01/P1-02）**：规则星期集合受 3 天视界限制（实证），且一次性例外（跳过/暂停/未来过滤）会被固化为永久周规则；更根本的是端口对"规则"身份无定义。修复前若真机适配器声明 `supportsRecurring`，将产生"启用但漏提醒"的静默业务失败——比"不注册"更隐蔽。**修复后必须补"规则星期并集 ⊇ 配置星期"与"例外不得进入规则模板"性质测试**。
3. **现有测试把缺陷固化为期望行为**：`workflow.test.mjs:305-320` 断言周一启用 → 规则 `['Mon','Tue','Wed']`。修复 P1-02 时**必须同步改写该测试**，否则修复会被测试拉回原状（或测试先红后绿，作为 TDD 验证）。
4. **系统副作用无事务性**：注册与存储无法原子提交，一致性只能靠"语义键幂等 + 逐项结果 + 启动对账 + 有界重试"（文档 13/18）。`settle` 门禁与迟到窗口保护是本仓库的正确实现样板，新适配器接入时不得绕过。
5. **定时器纪律**：唯一 `setInterval` 在 `break-active` 页面且隐藏即停、只做显示重算；任何新代码不得用 JS 定时器承担提醒正确性（ADR-0005 红线）。领域内 `EARLY/LATE_TOLERANCE_MS` 为 `INFERRED` 值，需探针标定后固化。
6. **回调路径的错误呈现**：`HandleReminderFired` 的过早/迟到异常目前以 Err 进入 UiModel（P3-02），接入提醒回调适配器（Phase 4）时需改为诊断 + 显式提示，避免后台回调惊扰用户。
7. **诊断隐私**：诊断条目不得包含健康数据、账号、个人数据（文档 11/23）；当前条目均为内部 tag/code，符合要求，但真机适配器接入日志时需保持。
8. **文档漂移需随代码同步**（P2-03）：端口契约（11）、统一语言事件名（03）、效果目录（05）、目录规范（25）、测试数（README）五处与代码不一致；`references/31_TRACEABILITY_MATRIX.md` 也应随之更新，否则文档体系作为"可执行规范"的权威性会逐次衰减。
9. **发布门禁项**：`config.json` 的 `vendor: "example"`、版本号 1.0.0/1000000、签名/UDID 材料——发布前按 `templates/RELEASE_CHECKLIST.md` 处理，任何签名材料不得入库。
10. **`SkipNext` 与注册表的依赖是设计事实，不是缺陷**（v2.0 误报已撤回）：当前跳过语义 = "更新抑制状态 + 全量对账"，对账必须知道已注册集合。若产品希望"注册表查询失败时仍允许跳过"，应设计为**基于稳定注册身份的定向取消**（与 P1-01 的 rule/occurrence 身份模型一并设计），而不是删除事实依赖。
11. **死资产清理**：`i18n/*.json` 无引用、`UiModel.route` 恒为 home、`listFailure` 恒 undefined（P2-04）——按"Touch only what you must"原则，可在对应功能提交时顺带清理，不必单独动工。
12. **覆盖率量化缺失**：文档要求 ≥90% 业务分支覆盖（QA-TEST-01），当前无 coverage 工具链。建议在宿主测试脚本中引入 `node --experimental-test-coverage`（或等价方案）并在 CI/提交前跑一次，作为适应度函数的补充。

---

## 九、建议（按优先级分批实施）

### 第一批：递归提醒契约与生成重构（P1-01/P1-02，阻塞 RecurringCalendar 路径可用性）

1. **契约重构（P1-01）**：修订 `ReminderSchedulerPort/v1`（或新增 v2）：
   - 为周规则定义稳定身份 `ruleKey` 与"一规则一系统注册"的适配器语义；
   - 区分规则级操作（按 ruleKey 注册/取消/查询）与 occurrence 级操作（单次例外）；
   - 定义单次例外表达（如 `ruleExceptions: [{ ruleKey, occurrenceDate, action }]`）；
   - 结算报告支持规则级失败（Partial 按规则主体报告）；
   - 定义周规则回调 → 具体语义键的生成规则（含 DST：本地日历时间为准、按日解析）；
   - 以 ADR 记录本次契约修订（模板见 `templates/ADR_TEMPLATE.md`）。
2. **规则生成修复（P1-02）**：`buildRecurrenceRules` 与实例化计划解耦——规则模板从完整配置（`settings.weekdays` + 完整周枚举）推导；例外走 occurrence 级抑制，不进规则模板。
3. **重写固化缺陷的测试**：`workflow.test.mjs:305-320` 改为断言"规则星期并集 = 配置星期"；新增性质测试"例外不得进入规则模板"；新增真实模拟"一规则一注册"的适配器契约测试（当前契约测试仅断言规则被传递）。
4. **并行路径建议（v2.2 补充）**：区分两条产品路径——**路径 A（短期）**：能力探针阶段即使设备声明 `supportsRecurring` 也暂不选择 `RecurringCalendarStrategy`，只开放已验证的 RollingWindow/SingleNext 路径，先行验证存储、振动、一次性提醒、息屏/退出行为、启动对账与功耗；**路径 B（完整）**：若发布必须依赖周重复能力，则 P1-01/P1-02 阻塞 Phase 4，按上述 1–3 完成契约与生成重构后再启用。

### 第二批：到期闭环顺序修复与 UX（P1-03/P2-02）

4. 修复归约与导航顺序：到期检测以 `endsAt` 绝对时间为主——到期即派发 `BreakElapsed`（命令处理器归约），成功后再导航；或归约后页面呈现"已结束"态并派发 `AcknowledgeBreakFinished`，使"归约→展示→确认"成为完整闭环；
5. `break-active.hml`/`break-due.hml` 补错误展示位与返回入口（P2-02）；`onComplete`/`onSkip` 失败后重渲染；
6. 补页面复用测试（第二次活动到期仍能导航）。

### 第三批：测试工具链可复现性（P1-04）

7. `fitness.test.mjs` 改为 `import.meta.url` 推导仓库根，删除硬编码路径；
8. 测试命令改为跨版本形式（目录参数或带引号 glob），README 同步更新版本要求；
9. CI/提交前输出证据包：commit SHA + Node 版本 + TAP/JUnit + 退出码（格式可参照附录 A）。

### 第四批：文档同步（P2-03，低成本高价值）

10. 更新 `11_PORT_CONTRACTS.md`（CalendarPort 签名 + 递归契约修订结果）、`03` 事件命名、`05` 效果目录（移除 PersistSnapshot 效果并说明壳层直存）、`25` 目录规范（workflows/ 说明）、README 测试数（176→178，或改动态表述）；
11. 若 `Active → SkipBreak` 为有意设计，更新 `08_STATE_MACHINES.md`。

### 第五批：平台接入（Phase 3/4，依赖探针）

12. 按 `20_CAPABILITY_PROBE_PLAN.md` 执行 G0–G7 探针；确认存储/时钟/振动/提醒适配器后接入 `app.js`（`createDeviceApp` 参数表已预留）；
13. 提醒适配器必须遵守修订后的端口契约（语义键幂等、规则级/occurrence 级语义、部分失败逐项报告、禁 JS 定时器）；接入后跑契约测试套件；
14. 在真机/模拟器上验证 `break-due → break-active` 导航链路与振动反馈（当前为 INFERRED）。

### 第六批：发布门禁（Phase 6/7）

15. 三日功耗 A/B 实测（文档 17 评测方法）；后台行为矩阵记录；
16. 覆盖率工具链接入（`node --experimental-test-coverage`），补齐 QA-TEST-01 度量；
17. 按 RELEASE_CHECKLIST 处理 vendor/版本/签名/隐私审查。

---

## 十、最终评价

**架构方向正确、执行扎实、诚实守信**。可核验的事实基础：函数式核心与平台副作用完全分离（FF-01~03 守护，且本次审阅对源码逐文件直接核对）、六边形依赖方向正确、能力门禁与结算门禁真实（注册失败绝不呈现"已启用"）、一次性提醒路径（对账/提交协议/迟到保护）有对应源码与测试证据（178 用例全绿，TAP 附件与哈希见附录 A.2）。上一轮审阅报告的 5 P0 / 11 P1 / 3 P2 已逐条复验：10 项功能修复到位，P0-05 属架构处置修复、功能缺口仍在（Phase 3/4）。

**但当前版本的定位应更谨慎**：除了真机适配器缺失（Phase 3 客观阻塞）之外——

- **RecurringCalendar 路径存在架构级缺口**：周规则视界采样缺陷（已实证）、一次性抑制污染永久规则模板（设备端表现**未定义且高风险**）、rule/occurrence 身份不统一、端口结算与取消语义不明确（P1-01/P1-02）。这是**契约与领域身份设计问题，需先重构再谈递归提醒的设备集成**；
- **活动到期闭环存在确定性顺序错误**（P1-03）与**测试工具链可复现性缺陷**（P1-04，工程证据链 P1）应在设备集成前修复。

**发布路径（v2.2 细化）**：递归提醒的设备集成探针必须等待契约重构（P1-01/P1-02）；但**一次性提醒、存储、振动与基础生命周期探针可并行开展**（路径 A：探针阶段暂不启用 `RecurringCalendarStrategy`，只走 RollingWindow/SingleNext），待契约重构完成后再启用递归路径（路径 B）。

**一句话结论**：纯领域内核、提交协议、能力门禁和一次性提醒对账路径整体成熟，可作为**内部工程决策与整改排期依据**；**应先完成递归提醒契约重构（含规则生成修复与可执行的适配器契约测试）、修复到期闭环顺序与测试工具链可复现性，再进入 GT6 真机探针的递归路径**。届时 Move25 才真正具备发布候选形态。

---

## 附录 A：测试与探针证据包（可独立复验）

### A.1 执行环境

| 项 | 值 |
|---|---|
| 操作系统 | Windows 11（`Z:` 为映射网络盘，`Z:\work\watch` 为仓库根） |
| Shell | PowerShell（pwsh） |
| Node 版本 | **v24.14.1**（`C:\D\WORK\environment\nvm\nvm\v24.14.1\node.exe`） |
| 审阅基线 | git commit `72019dc4a90f30e8525aa23487f2002f37b1d59d`（`master`，审阅时 HEAD） |
| 工作区状态 | 审阅期间源码工作区干净（`git status --porcelain` 实测输出仅含未跟踪的审阅报告与 evidence 附件，见 A.2 复现命令序列；探针临时脚本使用后已删除） |

> 注：Node 24 的测试运行器支持 glob 原生展开，故 `*.test.mjs` 命令在 Windows pwsh（不展开 glob）下仍可运行；Node 18 无原生 glob（见 P1-04）。

### A.2 测试运行（原始输出尾部）

命令：

```text
C:\D\WORK\environment\nvm\nvm\v24.14.1\node.exe --test entry/src/main/js/MainAbility/tests-host/*.test.mjs
```

退出码：**0**。输出尾部（逐字，符号因控制台代码页显示为 `�`）：

```text
�workflow: full journey from enable to disable on memory adapters (4.4384ms)
�workflow: partial registration failure is visible and reconciled on retry (0.9366ms)
�workflow: restart recovery reduces expired active session and paused plan (1.3208ms)
�workflow: persistence failure returns Err and never exposes the candidate state (0.2124ms)
�workflow: cancel failure never commits Disabled and retry converges (0.3443ms)
�workflow: orphan reminders are cleaned up by a later Disable or Reconcile (0.3309ms)
�workflow: late-tolerance keeps a pending reminder registered across reconcile (1.1012ms)
�workflow: skip cancels a future-dated reminder immediately (0.9796ms)
�workflow: recurrence rules reach the adapter on recurring capability (0.4475ms)
�workflow: DST boundary resolves every future local time individually (0.4672ms)
�tests 178
�suites 0
�pass 178
�fail 0
�cancelled 0
�skipped 0
�todo 0
�duration_ms 1456.4333
```

各测试文件用例数：calendar 8 / contract 14 / decide 42 / fitness 5 / pages 11 / plan.examples 14 / policy 8 / runtime 16 / settings 7 / settle 12 / snapshot 13 / ui 12 / values.examples 5 / workflow 11，合计 **178**（README 写 176，属文档漂移 P2-03，以本输出为准）。

复现命令（Node 21+）：

```text
node --test entry/src/main/js/MainAbility/tests-host/*.test.mjs
```

或跨版本（Node 18.13+，目录形式）：

```text
node --test entry/src/main/js/MainAbility/tests-host/
```

**完整证据附件（v2.2 起随报告保存，路径相对仓库根）**：

```text
Move25_Code_Review_2026-08-06_evidence/test-178.tap          # 完整 TAP 输出（1078 行）
Move25_Code_Review_2026-08-06_evidence/probe-recurrence.mjs  # P1-02 探针脚本（可独立复现，含预期/实测注释）
Move25_Code_Review_2026-08-06_evidence/probe-output.txt      # 探针原始输出
```

SHA-256（生成时点实测）：

```text
test-178.tap          E706FCEAE5B6C550838B3311F9AC3A93A7C4AFE530435A0C7F4AB209FD4A8768
probe-recurrence.mjs  713725F5637173E4A3C35336489A07DA21B957F5F09C84BD623936BD76DF419C
probe-output.txt      AE8E0C5FBEC91F14F4F5094186BC6D5E6D95B3C3D41E8966E54787FC19BC08E6
```

**审计级复现命令序列**（已实测，输出记录于证据附件与 A.1/A.2）：

```text
git rev-parse HEAD                                          # = 72019dc4a90f30e8525aa23487f2002f37b1d59d
git status --porcelain                                      # 源码工作区干净（仅未跟踪的报告与 evidence）
node --version                                              # = v24.14.1
node --test --test-reporter=tap entry/src/main/js/MainAbility/tests-host/*.test.mjs > test-178.tap
echo $LASTEXITCODE                                          # = 0（实测）
Get-FileHash test-178.tap -Algorithm SHA256                 # 或 sha256sum test-178.tap
node Move25_Code_Review_2026-08-06_evidence/probe-recurrence.mjs > probe-output.txt   # 在仓库根运行
```

说明：fitness 测试在本机硬编码路径 `Z:/work/watch` 上运行通过，**不能**据此证明其可在任意检出位置通过（P1-04）；完整 TAP 的持久化归档（CI artifact、不可变日志地址）待 CI 建立后补充。

### A.3 递归规则视界探针（P1-02 实证）

探针脚本（`probe-recurrence.mjs`，审阅后已删除；内容如下可原样重建）：

```js
import { decide } from './entry/src/main/js/MainAbility/domain/decide.js';
import { enablePlan } from './entry/src/main/js/MainAbility/domain/commands.js';
import { capabilityObserved } from './entry/src/main/js/MainAbility/domain/events.js';
import { initialDomainState } from './entry/src/main/js/MainAbility/domain/model.js';
import { evolveAll } from './entry/src/main/js/MainAbility/domain/evolve.js';
import { capabilitySupported } from './entry/src/main/js/MainAbility/domain/state.js';
import { localDate, minuteOfDay } from './entry/src/main/js/MainAbility/domain/values.js';
import { localToInstant } from './entry/src/main/js/MainAbility/domain/calendar.js';

const OFFSET = 480;
const d = localDate(2026, 8, 5).value; // 星期三（默认 Mon–Fri 设置）
const facts = {
  now: localToInstant(d, minuteOfDay(600).value, OFFSET).value,
  localWall: { localDate: d, minuteOfDay: minuteOfDay(600).value },
  utcOffsetMinutes: OFFSET,
  registeredPlan: [],
  horizonDays: 3
};
let state = initialDomainState();
const evo = evolveAll(state, [capabilityObserved(capabilitySupported({
  supportsRecurring: true, supportsCalendar: true, maxPendingCount: 30 }))]);
state = evo.value;
const decision = decide(state, enablePlan(), facts);
const registerEffect = decision.value.effects.find(e => e.tag === 'RegisterReminders');
const weekdays = [...new Set(registerEffect.recurrenceRules.flatMap(r => r.weekdays))];
console.log('recurrenceRules count =', registerEffect.recurrenceRules.length);
console.log('rule weekdays union   =', weekdays.join(','));
console.log('intent dates          =', [...new Set(registerEffect.intents.map(
  i => i.localDate.year + '-' + i.localDate.month + '-' + i.localDate.day))].join(', '));
```

原始输出：

```text
recurrenceRules count = 15
rule weekdays union   = Fri,Thu,Wed
intent dates          = 2026-8-5, 2026-8-6, 2026-8-7
```

复现命令：

```text
node probe-recurrence.mjs        # 在仓库根目录
```

结论：默认 Mon–Fri 配置下，周三启用产生的周重复规则仅覆盖 `{Wed,Thu,Fri}`；周一、周二提醒在应用不再打开时永不触发。

### A.4 上轮报告核对说明

上一轮报告 `Move25_Code_Review_2026-08-06.md` 与其问题清单在本次审阅时已提交于 `72019dc` 同批提交中；5.1 复验表的证据均来自对当前 HEAD 源码的直接阅读与测试断言位置核对，未依赖上一轮报告的自述。

---

## 附录 B：v2.1 修订处置表（外部复核意见 → 处置）

| # | 外部复核意见 | 验证 | 处置 |
|---|---|---|---|
| 1 | P2-01"`SkipNext` 不需要注册表"判断不成立 | ✅ 属实（`decide.js` SkipNext → `reconcileEffects` → `diffPlans(desired, registered, nowMs)` 消费 `registeredPlan`） | 撤回该条目，改为"设计说明"（5.2 撤回说明 + 第八章第 10 条）；`command-handler.js` 注释同步更正 |
| 2 | P1-01 未识别递归模型契约矛盾（ruleKey、例外表达、结算/取消语义、回调映射） | ✅ 属实（端口/适配器/结算代码走查，见 5.2 P1-01 证据 1–6） | 新增 **P1-01 契约未闭合**（升格为架构级）；原 P1-01 深化为 **P1-02 规则生成固化例外**，补"测试固化缺陷"证据（`workflow.test.mjs:305-320`） |
| 3 | 遗漏 `fitness.test.mjs` 硬编码绝对路径 | ✅ 属实（`fitness.test.mjs:6` `resolve('Z:/work/watch')`） | 新增 **P1-04**（含 glob 可移植性：Node 18 + Windows cmd 不可靠，本机用 Node 24 故通过） |
| 4 | "178 全绿"与探针缺可复验附件 | ✅ 属实 | 新增**附录 A 证据包**（Node 版本、命令、原始输出尾部、退出码、commit SHA、探针脚本全文与输出、复现步骤） |
| 5 | P1-02（旧）用户表现描述不准确：无可见"操作失败" | ✅ 属实（`break-active/index.hml` 无 error 元素，handler 失败不渲染） | 修正为"按钮无反应"（P1-03）；错误反馈位缺失并入 **P2-02**（范围扩展至 break-due 与 break-active 两页） |
| 6 | 最终结论过乐观 | ✅ 采纳 | 重写第十章与 1.2/1.3；建议重排为六批（契约重构 → 规则生成 → 到期闭环 → 测试工具链 → 文档 → 平台 → 发布），"修两个 P1 即可进入候选阶段"表述删除 |

## 附录 C：v2.2 修订处置表（第二轮外部复核意见 → 处置）

| # | 第二轮复核意见 | 验证 | 处置 |
|---|---|---|---|
| 1 | 上一轮问题数"7 个 P1"与复验表（11 项）矛盾 | ✅ 属实（编辑遗留） | 1.1 更正为"5 P0 / 11 P1 / 3 P2"；1.3 同步 |
| 2 | P0-05"已修复"表述过宽（真实适配器仍缺失、产品不可用） | ✅ 属实 | 复验表 P0-05 改为"◑ 架构处置已修复；功能缺口仍存在（Phase 3/4）"；1.1/1.3/第十章同步限定 |
| 3 | P1-03"竞态"定性不准（保存成功时是确定性顺序） | ✅ 属实（代码走查：`refresh→Finished→停表→不导航` 为正常路径） | 标题与机理改为"到期归约与页面导航顺序错误（确定性缺陷）"，保留异常分支下的边界竞争说明；场景 J、7.5、建议第二批同步 |
| 4 | P1-02 设备端表现断言过强（"永久消失"） | ✅ 采纳（P1-01 已确认适配器替换语义未定义） | 改为"污染规则模板；设备端表现**未定义且高风险**（槽位缺失/旧规则残留/重复注册均可能）" |
| 5 | P1-04 严重度标准需明确 | ✅ 采纳 | 标题与正文标注"**工程证据链 P1，非生产运行时 P1**"，附定级理由 |
| 6 | 证据包需完整 TAP + 哈希 + 审计级命令序列 | ✅ 执行 | 新增 `Move25_Code_Review_2026-08-06_evidence/`（test-178.tap 1078 行、probe-recurrence.mjs、probe-output.txt）+ 实测 SHA-256 + 复现命令序列（附录 A.2）；探针输出新增 `missing from rules = Mon,Tue` 对照行 |
| 7 | 评价性措辞（"上乘"）缺乏基准 | ✅ 采纳 | 第十章改为可核验事实描述（源码证据、测试证据、复验结果），删除横向行业比较 |
| 8 | 发布判断应区分路径 A/B，探针不必全部阻塞 | ✅ 采纳 | 九、建议第一批增补第 4 条（路径 A：短期不启用 RecurringCalendarStrategy，并行验证一次性路径；路径 B：完整修复后启用）；第十章"发布路径"细化 |

---

*报告生成方式：人工审阅全部 55 个源文件 + 实跑 178 个宿主测试（附录 A.2，完整 TAP 附件与 SHA-256 见 `Move25_Code_Review_2026-08-06_evidence/`）+ 独立探针实证（附录 A.3）+ 两轮外部复核共 14 项意见逐条源码验证（附录 B、附录 C）；未修改任何代码。*
