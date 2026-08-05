# 能力门禁架构

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 问题

产品依赖一个尚未确认的能力：GT6 Lite Wearable 普通三方应用能否在息屏、应用退出、手机断连后由系统触发提醒。把它隐藏在实现细节中会导致架构建立在幻觉上。

## 2. 能力即数据

系统能力由适配器探测并转为不可变领域值：

```text
Supported({
  exactness,
  maxPendingCount,
  survivesAppExit,
  survivesPhoneDisconnect,
  survivesReboot,
  recurringModes
})
```

能力数据参与纯策略选择：

```text
chooseMode(capability, settings) -> SupportedMode | BlockedMode | DegradedMode
```

## 3. 门禁层级

### G0 工程基线

Lite 工程可编译、签名、安装和启动。

### G1 模块可见

目标提醒模块在当前 Lite SDK 中可静态导入；不能靠运行时 `try/catch require()` 探测不存在模块。

### G2 权限与开放能力

调用不因权限、签名或开放能力被拒绝。

### G3 前台触发

60 秒提醒在应用前台触发。

### G4 后台触发

返回表盘和息屏后触发。

### G5 进程独立

应用被移出最近任务或进程终止后触发。

### G6 手机独立

断开手机蓝牙后触发。

### G7 重启与容量

确认重启保留语义、最大数量、重复规则和误差。

只有 G0–G6 全部通过，才能进入 Standalone MVP。

## 4. 降级规则

- G1 失败：停止正式 UI 开发，提交华为工单；
- G2 失败：申请开放能力并保留探针；
- G4/G5 失败：不得使用长 JS 定时器替代；
- G6 失败：架构不再满足跨手机独立目标，需要重新决策；
- 任何降级模式必须向用户显示“仅前台有效”等准确状态。

## 5. “柠檬喝水”的正确使用方式

官方说明它能在手表内设置喝水量并由手表提醒，但数据同步仅支持华为手机。[H3] 因此：

- 可参考其极简提醒产品形态；
- 不可据此推断它使用公开 Lite 提醒 API；
- 不可据此推断所有功能完全不依赖手机；
- 必须以自己的 SDK 和 GT6 探针结果为准。
