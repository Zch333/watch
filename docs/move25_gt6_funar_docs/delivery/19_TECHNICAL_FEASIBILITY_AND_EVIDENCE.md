# 技术可行性与华为证据基线

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 已确认事实

### E-HW-01 跨手机应用市场

华为 GT6 兼容性清单显示，HarmonyOS、Android 9+ 和 iOS 13+ 配对场景均支持运动健康 App 中的应用市场。[H2]

### E-HW-02 GT 系列应用安装路径

GT 系列手表侧不直接安装华为应用市场；用户通过运动健康 App 的设备详情页进入应用市场安装。[H3]

### E-HW-03 柠檬喝水

官方说明可在手表应用内设置喝水量并由手表提醒；手表与运动健康正常连接时可同步数据，且该同步功能仅华为手机支持。[H3]

### E-HW-04 Lite Wearable 调试设备注册

华为官方 AGC 文档要求在华为手机上使用 HUAWEI DevEco Assistant 和 HUAWEI Health 配对运动手表，随后读取型号和 UDID。[H4]

### E-HW-05 Lite Wearable 模拟器

DevEco Studio 提供 Huawei Lite Wearable Simulator，可运行/调试 Lite HAP 并模拟屏幕、电池和部分传感器状态。[H6]

### E-HW-06 标准代理提醒

标准 HarmonyOS Agent-powered Reminder 可在应用后台或进程终止后由系统发送提醒，并有场景、权限和数量管控。[H5]

## 2. 未确认事实

- `@ohos.reminderAgentManager` 或 `@kit.BackgroundTasksKit` 是否能在 GT6 Lite JS FA 工程中编译；
- 普通开发者是否能获得对应开放能力；
- GT6 是否支持应用退出、断手机后的本地提醒；
- 最大提醒数和重复规则；
- 重启后是否保留；
- 自定义震动、提示音、通知按钮和全屏跳转能力。

## 3. 技术路线

```text
DevEco Studio
  + [Lite] Empty Ability
  + Lite Wearable JS/类 Web UI 工程
  + config.json
  + HUAWEI DevEco Assistant 真机安装链路
```

具体 SDK 版本不得从手表“6.1.0”文本直接推导，必须记录实际安装的 Compatible SDK 和模板。

## 4. 可行性结论

- 纯手表产品方向：合理；
- 跨配对手机日常安装：官方支持；
- 纯手表可靠后台提醒：仍为技术门禁；
- 在门禁通过前，项目可完成全部纯领域、UI 原型、存储和假适配器，但不能承诺产品最终可用。
