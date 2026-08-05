# 从 v1 文档体系迁移到 FUNAR v2

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 结构变化

| v1 关注点 | v2 对应 |
|---|---|
| 需求/PRD | `product/`，并连接质量属性和追踪矩阵 |
| 系统架构 | `domain/` + `architecture/`，不再以页面和服务为中心 |
| 数据模型 | 代数数据模型、智能构造器、不变量和状态联合 |
| 提醒适配层 | 明确为 `ReminderSchedulerPort` 与反腐适配器 |
| 状态机 | 命令—事件—演化模型和 MVU |
| 低功耗 | 架构约束和适应度函数，不是优化建议 |
| 能力探针 | 能力门禁 G0–G7，结果进入领域能力值 |
| Vibe Coding | 分层 Prompt、证据门禁和 AI 输出验收 |
| 风险/决策 | ADR 与可执行门禁 |

## 2. 不再采用的表达

- Manager/Service 单例；
- UI 直接注册提醒；
- “后台保活”；
- 以系统 ID 作为领域身份；
- 一份探针同时检测多个未知 API；
- 把标准 ArkTS API 默认视为 Lite 可用。

## 3. 保留的产品结论

- Standalone 是首选产品方向；
- GT6 日常安装应跨手机生态；
- 开发调试需准备华为手机路径；
- 系统级提醒是唯一硬门槛；
- 不使用持续传感器、网络和长 JS 计时器。
