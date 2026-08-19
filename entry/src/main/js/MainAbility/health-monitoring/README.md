# HealthWeave 健康监测（开发中）

本目录严格实现 `健康.md` 和 `docs/health-monitoring/HealthWeave_GT6_FUNAR_docs/` 的共享健康内核。计划已进入开发，但运行功能仍由发布门禁控制并默认休眠。

## 不可绕过的产品开关

`config/release-gate.js` 中 `HEALTH_MONITORING_RELEASE_ENABLED = false`。运行时还要求用户开关为真，两个开关缺一不可。发布开关关闭时：

- 不申请健康权限；
- 不启动 GT6 传感器；
- 不读取 Android/云端健康数据；
- 不运行分析或 AI；
- 不上传数据或发布提醒；
- 删除既有数据的能力仍可用。

手表页面“保留开启意愿”只改变当前进程中的用户意愿，不持久化、不越过发布开关、不产生任何采集效果。

## 真实部署边界

```text
GT6 (Lite Wearable, API 20)
  -> 华为运动健康同步
  -> Android Health Service Kit + Huawei Cloud REST
  -> 规范化健康账本、质量、来源
  -> 确定性特征/基线/趋势/变化/报告
  -> 服务端 DeepSeek JSON 解释（可选）
  -> Android 报告与 GT6 极简摘要
```

工程使用 API 24 编译 SDK，但 `compatibleSdkVersion` 已设置为本机实有的 `6.0.0(20)`；构建产物清单的 `minPlatformVersion` 为 20。API 24 SDK 包含 Lite `@hms.health.store` / `@hms.health.service` 声明，但 `健康.md` 明确指出 GT6 最高 API 20，因此本模块禁止在手表 HAP 导入这两个 API。GT6 端只保留状态、短时实时传感器会话协议、有界缓存和手机摘要；当前发布门禁下也未声明 `READ_HEALTH_DATA`。

## 目录

- `config/`：默认关闭的发布门禁。
- `domain/`：观测、质量、来源、时间线、指标、个人基线、变化、报告、N-of-1、AI 安全、研究/发布门禁。
- `ports/`：Platform Health、Watch Sensor、Timeline、Consent、Capability、Algorithm、AI、Export、Audit、Clock 契约。
- `adapters/huawei/`：Android SDK + Cloud REST 混合数据面及注入边界。
- `adapters/memory/`：契约测试、PoC fixtures 与离线演示适配器。
- `adapters/watch/`：未通过 GT6 探针时显式失败的传感器适配器。
- `app/`：手机分析运行时和 GT6 伴随运行时。
- `backend/`：服务端 DeepSeek 适配器与确定性/AI 双引擎。
- `mobile/`：Android 原生端接入说明。

## 当前实现状态

| 能力 | 代码状态 | 发布状态 |
|---|---|---|
| 心率、步数、睡眠、SpO2、压力、HRV、温度、运动/GPS 统一模型 | 已实现并测试 | Dormant |
| Android SDK + Huawei Cloud REST 合并/去重 | 已实现端口与契约 | RequiresApproval |
| 实时/近实时/周期同步计划 | 已实现 | RequiresApproval |
| 质量、来源、不可变时间线 | 已实现并测试 | Dormant |
| HR/RHR、HRV/PRV、睡眠、SpO2、压力、温度、活动、训练/GPS 特征 | 已实现并测试 | Dormant |
| 个人基线、持久变化、N-of-1、日/周/月报告 | 已实现并测试 | Dormant |
| 确定性洞察与模板报告 | 已实现并测试 | Dormant |
| DeepSeek 服务端 JSON 适配器、Schema/事实/安全检查与回退 | 已实现并测试 | Credential/Consent gated |
| GT6 健康摘要页、短时会话预算、有界缓存 | 已实现并测试 | Release gate disabled |
| GT6 实时心率真实适配器 | 未装配，避免预申请权限 | DeviceProbeRequired |
| 企业 Health Service Scope 和实际数据 | 无外部批准/账号证据 | RequiresApproval |
| Android 原生 UI/SDK 包、云服务与数据库部署 | 仓库无对应平台工程/凭据 | External implementation required |

“已实现端口”不表示华为已经批准 Scope；“仿真器通过”也不表示 GT6 真机可用。

## 激活前硬门禁

1. 建立独立 Android 原生工程并实现共享 Port 契约；
2. 使用企业开发者身份申请最小 Health Service Scope；
3. 对 GT6 逐项记录心率、SpO2、睡眠、步数、压力、HRV、温度、运动和 GPS 的实际 payload、粒度、同步间隔与固件；
4. 优先完成 HRV 粒度与 GPS Route Scope 两项最高风险 PoC；
5. 后端完成鉴权、加密存储、密钥库、限流、审计、删除传播和部署验证；
6. DeepSeek 密钥只存在服务端，完成 AI 零容忍安全评测；
7. 在已完成 API 20 最低平台构建后，继续取得 GT6 签名安装、前台/熄屏/断连/低电量与功耗 A/B 证据；
8. `evaluateProductReleaseGate` 全部通过后，才允许单独评审发布开关改动。
