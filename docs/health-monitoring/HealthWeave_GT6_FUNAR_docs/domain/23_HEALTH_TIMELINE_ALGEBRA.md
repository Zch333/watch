# 健康时间线代数

## 1. 设计目标

时间线需要支持合并多个平台、重复同步、迟到数据、时区变化和算法重算，同时保持可解释性。

## 2. 基本操作

```text
empty : Timeline
append : Timeline × Observation -> Timeline
merge : Timeline × Timeline -> Timeline
dedupe : Timeline × IdentityPolicy -> Timeline
filterQualified : Timeline × QualityPolicy -> Timeline
window : Timeline × TimeInterval -> Timeline
partitionByContext : Timeline -> Map<Context, Timeline>
```

`merge` 应满足结合律；空时间线是单位元。去重必须幂等：`dedupe(dedupe(x)) = dedupe(x)`。

## 3. 身份策略

优先使用平台原始 ID；缺少 ID 时使用稳定语义键：

```text
hash(platform, sourceDevice, kind, start, end, normalizedValue, unit)
```

不要仅以时间和数值去重，避免合并不同设备观测。

## 4. 迟到和修正

- `observedAt`：生理事件时间；
- `recordedAt`：设备写入时间；
- `syncedAt`：平台同步时间；
- `ingestedAt`：本系统接收时间。

所有时间都保留，分析使用 `observedAt`，同步水位使用 `ingestedAt` 和平台游标。

## 5. 物化视图

每日摘要和周趋势是可重建物化视图，不是事实来源。算法升级时只追加新版本结果，并更新活跃视图指针。
