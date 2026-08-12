# `健康.md` 需求追踪

| `健康.md` 要求 | 实现 | 验证/门禁 |
|---|---|---|
| GT6 API 20 不使用 Lite Health Store API 24 | `compatibleSdkVersion = 6.0.0(20)`、产物 `minPlatformVersion = 20`；手表 bundle 无相关 import | DevEco 构建 + `health-monitoring.test.mjs` |
| 历史数据以 Android/Cloud Health Service 为主 | `adapters/huawei/` 混合端口 | 企业 Scope + GT6 PoC |
| 实时心率/运动走独立通道 | `SYNC_CHANNELS.Realtime` | Extended Health/Wear Engine 审批 |
| 步数/压力近实时，睡眠/SpO2/HRV/温度周期同步 | `huawei-data-plan.js`, `sync-policy.js` | 增量/重叠窗口测试 |
| 心率、SpO2、睡眠、步数、压力、HRV、体温、运动/GPS | `observation.js`, `feature-engineering.js` | 结构化特征测试 |
| HRV 粒度不能假定为 RRI | `huawei-data-plan.js`, HRV/PRV 独立算法 | HRV P0 PoC |
| GPS Route Scope 不能承诺 | `routeScopeValidated: false` | GPS P0 PoC |
| 先传统算法，后 LLM | `feature-engineering.js`, `dual-analysis-engine.js` | 确定性 source of truth |
| Android 不保存 DeepSeek Secret | `deepseek-adapter.js` 仅接受 `executionTier: server` | 安全静态/单元测试 |
| DeepSeek JSON 输出 | `response_format: json_object` | 单元测试 |
| AI 区分事实/推断，不改数值/置信度/红旗 | `insight.js` 验证器 | Schema/事实/行动/医学门禁 |
| AI 故障时仍可用 | `deterministicReport` 回退 | 双引擎测试 |
| 个人 7/30 日基线与持久偏离 | `baseline.js`, `reports.js` | 样本量与持久性测试 |
| 医疗/研究功能隔离 | `feature-registry.js`, `research.js` | 产品/研究发布门禁 |
| 用户授权、撤回、导出、删除 | 工作流、内存 Store、JSON/FHIR Export | 删除在 Dormant 下仍有效 |
| 默认不启动并保留开关 | `release-gate.js`, GT6 健康页面 | 默认 `false`、零效果测试 |

## 未伪造的外部缺口

- 无企业 Health Service Kit Scope 批准；
- 无 GT6 实际 Health Service payload；
- 无 HRV 粒度、GPS 轨迹、SpO2/体温同步频率证据；
- 无 Android 原生 SDK 工程和服务器部署环境；
- 无 DeepSeek 密钥或真实模型安全评测；
- 已有 API 20 SDK 与 `minPlatformVersion = 20` 构建证据；仍无 GT6 真机签名/安装/功耗证据。

这些缺口的代码路径均返回 `RequiresApproval`、`CapabilityNotAvailable` 或 `DeviceProbeRequired`，不会显示为已支持。
