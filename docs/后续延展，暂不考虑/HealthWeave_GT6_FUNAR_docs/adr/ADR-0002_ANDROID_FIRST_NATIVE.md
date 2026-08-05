# ADR-0002_ANDROID_FIRST_NATIVE：Android 原生优先

- 状态：Accepted
- 日期：2026-08-05

## 背景

用户当前为 vivo X200，华为健康和 Wear Engine Android 接入最重要。

## 决策

首发 Kotlin 原生；iOS/HarmonyOS 后续原生适配，共享领域协议。

## 后果

- 正面：边界清晰、可测试、可替换、可审计。
- 代价：需要更多显式类型、契约、探针和治理文档。
- 复审触发：华为平台能力、法规、设备或产品预期用途发生重大变化。
