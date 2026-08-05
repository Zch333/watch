# HealthWeave GT6：FUNAR 健康数据平台文档体系

> 版本：v1.0  
> 基线日期：2026-08-05  
> 目标设备：HUAWEI WATCH GT 6，HarmonyOS 6.1.0 系列固件  
> 架构方法：Functional Software Architecture（FUNAR）× Functional DDD × Hexagonal Architecture  
> 产品定位：消费级健康与运动数据的个人洞察平台，不是医疗诊断系统

## 1. 本文档体系解决什么问题

本项目的目标不是简单复制手表厂商已有页面，而是建立一条可验证、可扩展、可替换的数据链：

```text
GT6 / 华为运动健康
        ↓
数据采集与授权适配器
        ↓
规范化健康时间线 + 数据质量 + 来源证明
        ↓
确定性算法与个人基线
        ↓
异常/趋势/恢复/睡眠/运动洞察
        ↓
受约束的云端 AI 解释层
        ↓
手机、手表、导出与提醒
```

关键事实：GT6 的硬件和华为运动健康能够产生大量健康指标，但普通 Lite Wearable 手表应用可直接读取的公开实时传感器集合明显更窄。系统必须把“设备能测量”“华为健康平台能开放”“普通三方应用已获授权”“当前型号实际可用”视为四个不同命题。

## 2. 架构总原则

1. **Capability-gated**：没有 SDK、权限、型号和真机证据，不启用功能。
2. **Functional core / effect shell**：计算、验证、基线、规则和提示词构造保持纯函数；华为 API、数据库、网络和 AI 是外部效果。
3. **Provenance first**：每个数据点和派生指标必须携带设备、接口、固件、算法版本、时间、质量和授权来源。
4. **Quality before inference**：先判断信号和数据完整性，再计算指标；质量不足时输出“不确定”，而不是输出更强结论。
5. **Deterministic safety before LLM**：安全规则、异常阈值、单位和统计由确定性代码执行；LLM 只负责解释和组织语言。
6. **Wellness, not diagnosis**：默认只提供健康管理和行为建议，不诊断疾病、不调整药物。
7. **Local-first raw data**：原始波形和高敏数据默认本地保存；云端 AI 默认只接收去标识后的统计摘要和特征。
8. **Native adapters, shared contracts**：Android、iOS、HarmonyOS 使用原生健康平台适配器；共享的是领域协议和测试，而不是强行共享所有 UI/SDK 代码。

## 3. 推荐阅读顺序

### 决策者与产品负责人

1. `00_ARCHITECTURE_CHARTER.md`
2. `product/01_VISION_SCOPE.md`
3. `product/03_FEATURE_PORTFOLIO.md`
4. `evidence/10_GT6_API_CAPABILITY_MATRIX.md`
5. `product/04_SAFETY_AND_MEDICAL_BOUNDARY.md`

### 架构与研发

1. `domain/20_UBIQUITOUS_LANGUAGE.md`
2. `domain/22_FUNCTIONAL_DOMAIN_MODEL.md`
3. `architecture/31_HEXAGONAL_ARCHITECTURE.md`
4. `architecture/32_PORT_CONTRACTS.md`
5. `architecture/40_AI_INSIGHT_ARCHITECTURE.md`
6. `delivery/73_ARCHITECTURE_FITNESS_FUNCTIONS.md`

### 算法与研究

1. `evidence/13_RESEARCH_EVIDENCE_AND_LIMITATIONS.md`
2. `evidence/14_OPEN_SOURCE_ALGORITHM_CATALOG.md`
3. `algorithms/50_SIGNAL_QUALITY_PIPELINE.md`
4. `algorithms/59_PERSONAL_BASELINE_AND_CONFIDENCE.md`
5. `delivery/74_VALIDATION_BENCHMARK_PLAN.md`

### AI 与提示词

1. `ai/60_AI_SYSTEM_PROMPT_CORE.md`
2. `ai/66_AI_OUTPUT_SCHEMA_AND_VALIDATION.md`
3. `ai/67_AI_SAFETY_EVALUATION.md`

## 4. 文档目录

- `product/`：愿景、范围、功能组合、医学边界。
- `evidence/`：华为开放能力、健康数据目录、平台矩阵、研究证据、开源算法和许可证。
- `domain/`：统一语言、上下文、函数式领域模型、时间线代数、数据质量、不变量和工作流。
- `architecture/`：系统上下文、六边形架构、端口、适配器、手表端、移动端、同步、存储、云与 AI、安全和功耗。
- `algorithms/`：信号质量、心率/HRV、睡眠、活动、压力、血氧/呼吸/体温、训练负荷、异常检测、ECG 研究、个人基线。
- `ai/`：核心系统提示词、场景提示词、JSON 输出契约和安全评测。
- `delivery/`：能力探针、路线图、测试、适应度函数、算法验证、发布门禁、Vibe Coding 和风险。
- `adr/`：不可逆或高成本架构决策。
- `templates/`：能力、算法、模型、数据集、AI 评测和隐私影响模板。
- `references/`：公开资料与需求追踪。

## 5. 当前最关键结论

- GT6 的官方产品能力包括心率、血氧、睡眠、压力、体温、HRV、呼吸率、运动和部分健康研究，但这不等于三方应用可直接读取全部数据。
- Lite Wearable 手表应用公开能力应按“有限实时传感器”理解；完整健康时间线优先通过手机端 Health Service Kit 获取。
- Wear Engine 可提供手机—手表通信和部分传感器控制；人体传感器权限受限，必须申请并验证设备支持。
- Health Industry SDK 的数据范围最广，但属于行业/合作能力，不能作为普通消费应用 V1 的默认依赖。
- Android 是第一优先手机端；iOS 和 HarmonyOS 通过独立适配器逐步实现。
- 任何 HRV、睡眠分期、心律失常、睡眠呼吸暂停、跌倒、感染风险等高级能力必须绑定严格的数据和验证门禁。
