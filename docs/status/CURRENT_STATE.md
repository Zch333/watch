# Move25 当前状态

更新时间：2026-08-09

## Build

- Host tests：202 passed (`npm test`)
- Lite toolchain verifier：passed (`npm run verify:toolchain`)
- DevEco Lite HAP：passed (`assembleHap`, API 24 / liteWearable)
- 签名：当前工程没有配置发布签名，仅能生成 unsigned HAP

## Lite 仿真器

- 首页不再黑屏，可显示能力、计划、下一次活动与操作按钮
- 活动页使用可见递归计时器，倒计时按绝对结束时间更新
- 更多页改为固定尺寸静态按钮，避免 Lite `list` 树塌缩
- 设置页改为固定尺寸静态控件，避免动态样式/滚动树导致黑屏
- 设置页恢复 Mon–Fri、方案 1、25/5；自定义时段/节律可无损回读
- 设置保存会等待原生存储成功回调；提交期间留在当前页，失败不返回首页
- 诊断页改为静态文本投影，避免动态 `for` 列表渲染失败
- 2026-08-09 DevEco 圆形 466×466 smoke：首页、更多、设置均可见，无黑屏

## Runtime evidence dashboard

- 诊断页显示 SDK、构建 SHA（dirty 标识）、计划、能力、交付模式与时区
- 诊断页显示震动适配器接线状态、提醒注册数、快照 revision、持久化状态和最近错误
- 构建 SHA 由 Lite bundle hook 在构建时注入，不写入本机绝对路径

## Storage durability

- `StorePort/v2` 已落地 callback 异步提交；native success 前不推进 committed state/revision
- `system.storage.set` 失败后保留旧快照，Imperative Shell 不暴露未提交 candidate state
- 启动读取和每次写入均使用 3000ms 明确超时；不再静默回退到默认/内存状态
- 设置页只在持久化成功回调后离页；写入失败或超时留页显示错误
- DevEco 当前 smoke 中启动读取可以完成，但首次能力状态写入显示失败；仿真器写入能力不能替代 GT 6 真机证据

## Capability

| 能力 | 当前结果 |
| --- | --- |
| Lite Storage | StorePort/v2 已接入；DevEco 读可用、写失败；真机仍需证据 |
| Lite Vibrator | 已接入，真机震动仍需设备证据 |
| Lite ReminderAgent | API 24 Lite Wearable 未发现，明确显示 Unsupported |
| PhoneRelay / Wear Engine | 尚未实现/验证 |

## Remaining gates

1. 在 GT 6 真机完成 Storage、Vibrator、重启恢复证据。
2. 在 GT 6 上确认 `system.storage.set` 的 success/fail 回调与重启恢复；当前 DevEco 写入失败不能视为真机结论。
3. 选择并实现 `WatchStandalone > PhoneRelay > ManualOnly` 的提醒交付策略。
4. 配置签名后完成真机安装、息屏、进程退出和断连重连验证。
