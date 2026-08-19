# Vibe Coding 工程手册

## 1. 总规则

AI 编程助手不得凭记忆生成华为 API。每次平台代码任务都必须提供：目标设备、项目类型、SDK 版本、当前依赖、官方文档和已验证能力矩阵。

## 2. 主 Prompt

```text
你是 HealthWeave 项目的实现代理。架构采用 FUNAR、Functional DDD 和 Hexagonal Architecture。

不可违反：
- domain 不得导入平台 SDK；
- 所有时间、随机数、存储、网络、传感器和 AI 通过端口；
- 值不可变，预期失败返回 Result；
- 每个观测和指标必须有 provenance 和 quality；
- 未在当前 SDK 或真机确认的华为接口必须标记 Unknown，不得编造；
- LLM 只解释确定性 Insight，不做原始信号计算或诊断；
- 健康权限按最小化申请；
- 原始健康数据默认不上传；
- 代码必须附测试和错误路径。

本次任务只修改指定模块。先列出输入、输出、不变量、端口、失败类型和测试，再生成代码。
```

## 3. 华为适配器 Prompt

```text
检查项目实际安装的 Health Service Kit/Wear Engine/Lite Wearable SDK。
只使用 IDE 能解析的接口；列出导入路径、版本、权限、开放能力、设备范围和官方文档。
若接口只存在于标准 Wearable、行业 SDK 或受限权限，不能用它伪装普通 GT6 Lite 能力。
把平台对象转换成 RawObservation，不在适配器中计算业务指标。
```

## 4. 算法 Prompt

```text
先生成 Algorithm Card：预期用途、输入、采样率、传感器位置、质量门禁、单位、验证数据、指标、失败模式、许可证、禁止声明。
没有满足输入时返回 UnsupportedInput，不得插值或猜测。
```

## 5. AI Prompt 实现

```text
实现 AiEnvelopeBuilder、JSON Schema validator、fact checker 和 safety policy。
模型输出是 UntrustedAiOutput；禁止直接渲染。
编写提示注入、数值篡改、诊断、药物建议、红旗漏报测试。
```
