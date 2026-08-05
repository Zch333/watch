# 适配器目录与反腐层

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 驱动适配器

### Watch UI Adapter

- 将点击、选择器和页面生命周期转为领域命令；
- 将领域 `ViewModel` 转为 HML 可绑定数据；
- 不包含日程计算和提醒注册。

### Reminder Callback Adapter

- 将平台回调解析为语义键和触发时间；
- 验证来源、格式和版本；
- 调用 `ReminderCallbackPort`；
- 平台对象不得穿透到领域。

### Lifecycle Adapter

在应用启动、恢复和设置页面保存后触发恢复/对账工作流。

## 2. 被驱动适配器

### Lite Storage Adapter

- 负责 JSON 编解码、校验和迁移；
- 采用单快照或双槽写入策略，避免部分写入；
- 不把缺失字段静默填成可能改变业务的默认值。

### Reminder Adapter

这是高风险反腐层：

- 当前 API 名称、权限、请求结构和限制都封装在此；
- 先通过独立构建分支确认模块存在；
- 再通过真机确认后台行为；
- 任何标准 Wearable ArkTS 示例不得直接进入 Lite 适配器。

### Haptics Adapter

只负责把语义模式映射为设备振动调用；免打扰和设备拒绝应返回可诊断结果。

### Clock/Calendar Adapter

把系统日期时间转换为领域 `LocalDate`、`MinuteOfDay` 和 `Instant`。

## 3. 反腐层规则

- 平台枚举不进入领域；
- 平台错误码映射为稳定内部错误码，并保留原始码供诊断；
- 平台 ID 不成为领域身份；
- 平台容量和特性转换为 `ReminderCapability` 数据；
- 所有适配器必须通过端口契约测试。

## 4. 适配器成熟度

| 适配器 | 初始状态 | 升级条件 |
|---|---|---|
| 内存存储 | 可立即实现 | 单元测试通过 |
| Lite 本地存储 | 待 SDK 验证 | 编译 + 模拟器 + 真机 |
| 假提醒适配器 | 可立即实现 | 契约测试通过 |
| GT6 提醒适配器 | `UNKNOWN` | 能力探针全部门禁通过 |
| 振动适配器 | 待 SDK/真机确认 | 权限 + 真机振动 |
| 自定义声音 | 不进入 MVP | 明确能力和功耗测试通过 |
