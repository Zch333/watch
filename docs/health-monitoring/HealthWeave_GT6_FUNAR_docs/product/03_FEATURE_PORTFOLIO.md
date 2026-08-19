# 健康功能组合与产品准入等级

## 1. 等级定义

- **L0 基础展示**：直接展示平台已计算数据，不重新医学解释。
- **L1 低风险健康管理**：个人基线、趋势、规律、行为建议。
- **L2 高级分析**：需要可靠采样、独立验证和置信度管理。
- **L3 研究功能**：仅研究模式，需知情同意、数据集和模型卡。
- **L4 医疗/受监管**：除非完成法规路径，否则不进入消费产品。

## 2. 功能矩阵

| 功能 | 所需数据 | 目标等级 | GT6 现实路径 | 初始状态 |
|---|---|---:|---|---|
| 每日活动、步数、久坐打断 | 步数/活动小时/ACC | L1 | Health Service；手表端步数/ACC 可探针 | 可做 |
| 睡眠时长与规律性 | 睡眠记录/入睡起床 | L1 | Health Service | 可做 |
| 睡眠分期解释 | 睡眠阶段 + 质量 | L1/L2 | 优先使用华为已计算阶段；不自行声称 PSG 等价 | 可做但限声明 |
| 静息心率趋势 | HR/RHR | L1 | Health Service | 可做 |
| HRV/恢复趋势 | HRV/RRI 或合格 PPG/ECG | L2 | Health Service/行业 SDK；验证数据类型语义 | 能力门禁 |
| 血氧趋势 | SpO2 | L1/L2 | Health Service | 可做，强调测量条件 |
| 呼吸率趋势 | respiratory rate | L1 | Health Service | 能力门禁 |
| 皮肤/体表温度趋势 | body/skin temperature | L1/L2 | Health Service/行业 SDK | 能力门禁 |
| 压力与恢复 | 平台压力 + HRV/睡眠/活动 | L1 | 平台值优先；自研仅作复合指数 | 可做 |
| 训练负荷与恢复 | 运动记录、HR、时长、功率/配速 | L1/L2 | Health Service | 可做 |
| VO2max 趋势 | 平台 VO2max | L1 | Health Service | 能力门禁 |
| 心率恢复 | 运动结束后的 HR | L1/L2 | Health Service 运动数据 | 可做 |
| 个体异常检测 | 连续指标 + 质量 | L2 | 手机端算法 | 可做，非诊断 |
| 跌倒识别 | 高采样 ACC/GYRO + 标注 | L3/L4 | 行业 SDK/实时传感器 | 研究门禁 |
| 房颤/心律失常 | ECG 或经验证 PPG + 临床数据 | L4 | 系统功能或受限 SDK | 不做诊断 |
| 睡眠呼吸暂停 | SpO2/呼吸/PPG/睡眠 + PSG 标注 | L4 | 平台记录或行业能力 | 不自研诊断 |
| 血压/血糖 | 专用设备或用户录入 | L4 | Health Service 数据类型不代表 GT6 能测 | 只做数据整合 |
| 情绪洞察 | 用户记录 + 平台情绪/睡眠/活动 | L1/L2 | 取决于数据开放 | 能力门禁 |
| 女性健康 | 周期记录 + 体温/HR/HRV/呼吸 | L2/L4 | 平台/研究能力 | 仅健康记录，不评估疾病 |

## 3. “尽可能全面”的正确实现方式

全面不意味着一次上线所有算法，而是建立统一插件协议：

```text
AlgorithmDefinition = {
  id,
  version,
  requiredCapabilities,
  requiredInputs,
  qualityPolicy,
  evidenceGrade,
  intendedUse,
  prohibitedClaims,
  execute,
  explainability,
  license
}
```

新增算法时无需改动时间线、授权、存储和 AI 框架，只需通过能力、质量、验证、许可证和发布门禁。
