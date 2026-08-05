# GT6 能力探针计划

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 探针原则

每个实验只改变一个变量。不得把通知、代理提醒、振动、权限和完整 UI 混入同一 HAP，以免无法判断失败层级。

## 2. Probe 0：基线工程

目标：

- `[Lite] Empty Ability` 编译；
- HAP 签名和安装；
- 页面启动；
- 日志读取；
- 本地存储和振动分别验证。

输出：环境记录、HAP、日志、真机截图、结果模板。

## 3. Probe 1：模块编译

从基线建立独立分支，只加入一个静态导入候选。不存在模块时，构建失败本身就是结论；运行时 `try/catch require()` 不能捕获编译期模块解析失败。

候选模块必须来自当前 SDK 搜索结果，不能由 AI 猜测。

## 4. Probe 2：权限/开放能力

模块可编译且 HAP 可安装后：

- 声明最小权限；
- 在 AGC 申请所需开放能力；
- 注册最简单的 60 秒提醒；
- 不加入按钮、自定义音频和全屏跳转。

## 5. Probe 3：行为矩阵

| 场景 | 通过标准 |
|---|---|
| 应用前台 | 到点触发 |
| 返回表盘 | 到点触发 |
| 手表息屏 | 到点唤醒/震动，按系统策略显示 |
| 应用退出 | 不依赖应用进程仍触发 |
| 手机蓝牙断开 | 本地仍触发 |
| 手表重启 | 明确记录保留或不保留 |
| 免打扰 | 记录系统抑制语义，不错误归因 |
| 低电量模式 | 记录误差和是否触发 |

## 6. Probe 4：容量与精度

- 分别注册 1、5、15、30 及设备允许的更多提醒；
- 记录最大成功数、错误码、误差；
- 验证重复时间、取消、更新和重启；
- 不将标准 HarmonyOS 文档的 30 条上限直接视为 GT6 事实。[H5]

## 7. 决策输出

```text
CapabilityVerdict =
  | StandaloneApproved
  | ApprovalRequired
  | ForegroundOnly
  | PhoneDependent
  | Unsupported
```

只有 `StandaloneApproved` 进入正式 MVP。

## 8. 开发设备

官方运动手表注册路径使用华为手机上的 HUAWEI DevEco Assistant 与 HUAWEI Health。[H4] vivo X200 可以继续日常配对，但开发阶段应准备兼容该流程的华为手机。
