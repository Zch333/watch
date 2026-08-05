# 需求—能力—领域—端口—测试追踪矩阵

| 需求 | 能力来源 | 领域 | 端口 | 主要测试 |
|---|---|---|---|---|
| GT6 心率/佩戴实时会话 | Lite sensor | Acquisition/Quality | WatchSensorPort | Probe A、功耗 |
| 历史睡眠/心率/活动 | Health Service | Ledger | PlatformHealthPort | Probe B、同步契约 |
| 原始 PPG/ACC | Wear Engine/Industry | Research/Quality | WatchSensorPort | 审批、参考设备验证 |
| Android 优先 | Huawei Android SDK | Platform | PlatformHealthPort | vivo 后台/授权 |
| iOS/HarmonyOS | 原生 SDK | Platform | 同一端口 | 平台契约测试 |
| 个人基线 | 本地/云算法 | Baseline | AlgorithmPort | 属性、回放 |
| AI 分析 | 云 AI | AI Explanation | AiInferencePort | Schema、安全、事实 |
| 隐私 | 全链路 | Consent | Consent/Crypto/Audit | 撤回、删除、渗透 |
| 全面功能扩展 | Plugin registry | Metric/Research | AlgorithmPort | Algorithm Card 门禁 |
| 低功耗 | GT6/手机 | Cross-cutting | Sensor/Sync ports | A/B 电量 |
