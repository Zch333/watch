# 需求—领域—端口—测试追踪矩阵

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

| 需求 | 领域规则/工作流 | 端口 | 测试/门禁 |
|---|---|---|---|
| 工作时段内按 25/5 提醒 | `generateBlockPlan`, `Rhythm`, `WorkBlock` | Calendar, Reminder | 调度性质测试、真机 G3–G6 |
| 活动 5 分钟 | `BreakSession.Active.endsAt` | Clock, optional Reminder | 状态机、息屏恢复 |
| 伸展和护眼提示 | Break Guidance 组合/轮换 | UI | ViewModel 快照测试 |
| 跨 vivo/iPhone/鸿蒙 | Standalone ADR | 应用市场安装链路 | 官方兼容性证据、发布测试 |
| 低功耗 | 绝对时间、系统调度 | Reminder, Haptics | 适应度函数、三日功耗 A/B |
| 暂停/跳过 | `applySuppression` | Store, Reminder | 性质测试、对账测试 |
| 设置持久化 | Snapshot/Migration | Store | 契约、损坏恢复、迁移 |
| 应用退出仍提醒 | CapabilityGate | Reminder | G5 |
| 手机断开仍提醒 | CapabilityGate | Reminder | G6 |
| 更换 API 不改领域 | Hexagonal ports | all | 假/真实适配器契约 |
| 失败不误导用户 | PlanLifecycle.Blocked/Degraded | Diagnostic, UI | 状态机、错误注入 |
