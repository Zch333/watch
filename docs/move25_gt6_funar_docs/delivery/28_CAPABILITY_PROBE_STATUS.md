# 能力探针状态追踪

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 更新日期：2026-08-09
> 说明：探针需要签名材料、华为调试手机与 GT6 真机，当前环境无法执行。下表如实记录状态与证据等级，不伪造任何成功结果。

## 探针进度

| 探针 | 目标 | 状态 | 证据等级 | 阻塞项 |
|---|---|---|---|---|
| Probe 0 | 基线工程编译、签名安装、页面启动、日志、本地存储与振动分验 | 🟡 部分完成 | SDK 构建 + 466×466 首页预览 | 尚缺签名安装、GT6 六页/存储/振动行为证据 |
| Probe 1 | 候选模块静态编译 | ✅ SDK 静态核查完成 | SDK_CONFIRMED | `@system.storage`、`@system.vibrator` 可编译；`liteWearable` SysCap 无 ReminderAgent |
| Probe 2 | 权限/开放能力 + 60 秒最小提醒 | ⏳ 待执行 | UNKNOWN | AGC 开放能力申请、签名材料 |
| Probe 3 | 行为矩阵（前台/表盘/息屏/退出/断连/重启/免打扰/低电量） | ⏳ 待执行 | UNKNOWN | GT6 真机 |
| Probe 4 | 容量与精度（1/5/15/30+ 提醒、重复/取消/更新/重启） | ⏳ 待执行 | UNKNOWN | GT6 真机 |

## 真机测试追溯表（预登记）

| 场景 | 通过标准 | 状态 |
|---|---|---|
| 应用前台 | 到点触发 | 待验证 |
| 返回表盘 | 到点触发 | 待验证 |
| 手表息屏 | 到点唤醒/震动 | 待验证 |
| 应用退出 | 不依赖进程仍触发 | 待验证 |
| 手机蓝牙断开 | 本地仍触发 | 待验证 |
| 手表重启 | 明确记录保留或不保留 | 待验证 |
| 免打扰 | 记录系统抑制语义 | 待验证 |
| 低电量模式 | 记录误差和是否触发 | 待验证 |

## 结论门禁

`CapabilityVerdict` 只在 `StandaloneApproved` 时进入正式 MVP。在获得 `DEVICE_CONFIRMED` 前：
- 不将“可靠后台提醒”写入产品承诺；
- UI 如实展示 `Unknown / Unsupported / ApprovalRequired / Degraded`；
- 领域内核、假适配器、UI、测试与文档继续推进（已完成）。

## 当前可在宿主环境验证的结论

- 宿主测试全绿，当前数量见 `docs/status/CURRENT_STATE.md`（覆盖设备时钟/日历能力、性质、状态机、随机命令序列模型走查、工作流、契约、迁移、UI、异步提交导航、回调幂等、时间边界/时区与适应度）；
- API 24 Lite HAP 已完成静态编译；存储与振动达到 `SDK_CONFIRMED`，尚未达到 `DEVICE_CONFIRMED`；
- DevEco 圆形 466×466 预览可显示首页；预览器报告存储写失败且页面未提前导航，该结果只证明失败路径，不外推为 GT6 存储结论；
- 当前 `liteWearable` SysCap 不含 ReminderAgent，产品入口明确报告 `Unsupported`，不静默降级为前台计时器；
- 页面倒计时只在可见时由 `TickVisible` 从绝对 `endsAt` 重算。
