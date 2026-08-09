# Move25 当前状态

更新时间：2026-08-09

## Build

- Host tests：207 passed (`npm test`)
- Lite toolchain verifier：passed (`npm run verify:toolchain`)
- Release invariant verifier：passed (`npm run verify:release`)
- DevEco Lite HAP：passed (`assembleHap`, API 24 / liteWearable)
- 签名：当前工程没有配置发布签名，仅能生成 unsigned HAP
- 可复现性门禁：当前 worktree 的 `tools/` 与 `.github/workflows/host-tests.yml` 尚未被 Git 跟踪；从 `HEAD` 本地 fresh clone 时 202 项旧测试通过，但 `npm run verify:toolchain` 因缺少 `tools/verify-toolchain.mjs` 失败。合入这些文件前不得宣称远程仓库可复现构建

## Lite 仿真器

- 首页不再黑屏，可显示能力、计划、下一次活动与操作按钮
- 活动页使用可见递归计时器，倒计时按绝对结束时间更新
- 更多页改为固定尺寸静态按钮，避免 Lite `list` 树塌缩
- 设置页改为固定尺寸静态控件，避免动态样式/滚动树导致黑屏
- 设置页恢复 Mon–Fri、方案 1、25/5；自定义时段/节律可无损回读
- 所有会改变持久状态的页面动作（启停、立即活动、暂停/跳过、活动开始/完成/确认、设置保存）均等待命令完成回调；提交失败不会提前导航
- 诊断页改为静态文本投影，避免动态 `for` 列表渲染失败
- 2026-08-09 本轮修复后由 DevEco 重新构建并加载圆形 466×466 预览：首页可见、无黑屏，构建输出为 `BUILD SUCCESSFUL`
- 预览器首次能力状态持久化显示“能力状态保存失败”；点击会改变状态的“立即活动”后仍停留首页，符合“durable commit 失败不导航”的约束
- 预览画布未响应自动化点击“更多”，因此不把本轮多页交互记为通过；既有多页 smoke 与宿主页面测试只能作为辅助证据，最终六页矩阵仍以 GT6 为准

## Runtime evidence dashboard

- 诊断页显示 SDK、构建 SHA（dirty 标识）、计划、能力、交付模式与时区
- 诊断页显示震动适配器接线状态、提醒注册数、快照 revision、持久化状态和最近错误
- 构建 SHA 由 Lite bundle hook 在构建时注入，不写入本机绝对路径
- 应用版本由 `config.json` 注入诊断页，设备证据可同时记录版本、SDK 与构建 SHA

## Storage durability

- `StorePort/v2` 已落地 callback 异步提交；native success 前不推进 committed state/revision
- `system.storage.set` 失败后保留旧快照，Imperative Shell 不暴露未提交 candidate state
- 启动读取和每次写入均使用 3000ms 明确超时；不再静默回退到默认/内存状态
- 设置页只在持久化成功回调后离页；写入失败或超时留页显示错误
- 首页、更多页、到期页与活动页同样只在 durable command completion 成功后导航；宿主测试包含 pending/失败导航回归
- `Vibrate` / `Navigate` 展示效果延迟到 durable commit 成功后执行；提交失败不震动、不导航，207 项宿主测试覆盖该顺序
- DevEco 当前 smoke 中启动读取可以完成，但首次能力状态写入显示失败；仿真器写入能力不能替代 GT 6 真机证据

## Capability

| 能力 | 当前结果 |
| --- | --- |
| Lite Storage | StorePort/v2 已接入；DevEco 读可用、写失败；真机仍需证据 |
| Lite Vibrator | 已接入，真机震动仍需设备证据 |
| Lite ReminderAgent | API 24 Lite Wearable 未发现，明确显示 Unsupported |
| PhoneRelay / Wear Engine | 尚未实现/验证 |

## Remaining gates

1. 将当前 worktree 必需的 `tools/` 构建桥、verifier 与 CI workflow 纳入下一次受审提交，随后在 fresh clone 重跑两项门禁。
2. 在 GT 6 真机完成 Storage、Vibrator、重启恢复证据。
3. 在 GT 6 上确认 `system.storage.set` 的 success/fail 回调与重启恢复；当前 DevEco 写入失败不能视为真机结论。
4. 由产品决策确认是否重开 Standalone-first ADR 并进入 PhoneRelay/Wear Engine 后备路线；当前仍为诚实的 ManualOnly 降级。
5. 配置签名后完成真机安装、息屏、进程退出和断连重连验证。
