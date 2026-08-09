# 持久化、快照与迁移

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 数据所有权

本地快照是领域配置和运行意图的事实源；系统提醒集合是可重建投影。

## 2. 快照结构

```text
Snapshot = {
  schemaVersion,
  revision,
  settings,
  planLifecycle,
  pause,
  skip,
  breakSession,
  capabilityObservation,
  reminderIdMap,
  diagnosticsCursor
}
```

`reminderIdMap` 属于适配器数据，可与领域快照分区存储；领域只依赖语义键。

## 3. 保存策略

- 每次保存完整、已验证快照；
- 当前 `StorePort/v2` 使用单一语义键，并把平台 `success` callback 作为 durable commit 边界；
- 平台返回失败或超时时，内存 committed revision 保持不变，不暴露候选状态；
- Lite Storage 是否在写失败时物理保留旧值仍需 GT6 真机验证，不宣称已经实现双槽原子切换；
- 读取时先解析，再迁移，再验证；
- 不允许“解析失败后全部恢复默认”而不告知用户。

## 4. 迁移函数

```text
migrate : RawSnapshot -> Result<MigrationError, CurrentSnapshot>
```

迁移是纯函数，按版本逐级执行：`v1 -> v2 -> v3`。每级有固定测试样本。

## 5. 重启恢复

1. 读取并验证快照；
2. 获取当前时间；
3. 归约过期暂停、跳过和活动会话；
4. 重新生成期望计划；
5. 与系统投影对账；
6. 更新 UI 模型。

## 6. 数据最小化

只保存应用运行所需设置、少量诊断和当前状态；默认不保存长期行为历史。若以后增加统计，应单独进行隐私和功耗决策。
