# 发布、运维与可观察性

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 发布阶段

1. 本地纯核心测试；
2. Lite 模拟器；
3. GT6 调试签名 HAP；
4. 内部/邀请测试；
5. 自用稳定性运行；
6. 应用市场发布。

## 2. 发布门禁

- 目标 GT6 和完整固件版本已记录；
- SDK、DevEco Studio、签名 Profile 已记录；
- 后台能力结论为 `DEVICE_CONFIRMED`；
- 连续三工作日后台矩阵通过；
- 功耗报告完成；
- 权限与隐私声明一致；
- 无未经确认的平台 API；
- 恢复和迁移测试通过。

## 3. 本地可观察性

无服务器时，使用有界环形诊断日志：

```text
Timestamp
EventCode
SemanticKey (optional)
Adapter
StableErrorCode
RawPlatformCode (optional)
Firmware/SDK metadata
```

最多保留固定条数，避免无限增长。

## 4. 诊断页面

显示：

- 应用版本；
- 配置版本；
- 能力状态；
- 最近对账时间；
- 期望/已注册提醒数；
- 最近错误；
- 导出或人工抄录所需的简化信息。

## 5. 兼容性回归

下列变化触发完整探针：

- GT6 固件升级；
- Lite SDK 升级；
- DevEco Studio 升级；
- 提醒开放能力或权限变化；
- 适配器实现变化。
