# Move25 发布就绪状态

更新时间：2026-08-09

## 当前裁决

**Device Debug Candidate：通过。** 当前源码已经具备进入签名、安装和 GT6 真机探针的本地条件。

**Reliable Reminder Release：No-Go。** 当前 API 24 `liteWearable` SDK 未发现 ReminderAgent，且没有 GT6 `DEVICE_CONFIRMED` 或 PhoneRelay 实现。正式使用仅能诚实提供 `ManualOnly` 手动活动体验，不能宣传后台可靠提醒。

## 已通过的本地门禁

- [x] Functional Core 无平台依赖
- [x] MVU 页面动作等待 durable completion
- [x] `Vibrate` / `Navigate` 只在 durable commit 后执行
- [x] 207 项宿主测试通过
- [x] Lite toolchain verifier 通过
- [x] release invariant verifier 通过
- [x] Lite API 24 unsigned HAP 构建通过
- [x] 包名固定为 `com.move25.watch`
- [x] vendor 不再使用模板占位值
- [x] 版本为 `1.0.0` / `1000000`
- [x] 权限仅 `ohos.permission.VIBRATE`
- [x] 无网络、定位、健康或传感器依赖
- [x] 诊断页显示应用版本、SDK、构建 SHA、能力、交付模式、存储状态与最近错误

## 必须在设备上关闭的门禁

- [ ] 配置受控 debug signing（证书/Profile 不入库）
- [ ] GT6 安装并启动 HAP
- [ ] Storage `get/set` callback 与重启恢复
- [ ] Vibrator 物理触感
- [ ] 页面 smoke：home/more/settings/break-due/break-active/diagnostics
- [ ] 息屏、退出、断连、重启、免打扰、低电量矩阵
- [ ] 三工作日漏报与功耗 A/B
- [ ] 后台交付路线得到 `DEVICE_CONFIRMED`，或产品明确接受 `ManualOnly`

## 构建可复现性注意

`tools/` 与 `.github/workflows/host-tests.yml` 当前存在于 worktree，但尚未进入 `HEAD`。合并本轮变更后必须从 fresh clone 运行：

```text
npm test
npm run verify:toolchain
npm run verify:release
```

三项全部通过后，才可关闭远程仓库可复现性门禁。

## 当前 unsigned 调试产物

- 路径：`entry/build/default/outputs/default/entry-default-unsigned.hap`
- 大小：546 KB（`ls -lh`）
- SHA-256：`4fa1586f9e081b36e1524d2dfde6a008976c5cccb5cab81f6dabd93d2a4ce11a`
- 状态：仅用于构建完整性核对；未签名，不能替代最终 GT6 安装产物
