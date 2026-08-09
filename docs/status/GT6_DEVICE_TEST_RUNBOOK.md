# GT6 最终设备调试 Runbook

更新时间：2026-08-09

## 1. 测试前记录

- Git commit：
- Build SHA（诊断页）：
- 应用版本（诊断页）：
- DevEco Studio 版本：
- Lite SDK：6.1.1(24)
- GT6 型号/地区：
- GT6 完整固件：
- 配对手机/系统：
- Profile 类型与到期日：

不要把证书、Profile、UDID、账号或个人日志提交到 Git。

## 2. 签名与安装

1. 在 DevEco Studio 的 Project Structure > Signing Configs 配置本机 debug signing。
2. 确认 `bundleName = com.move25.watch`，不得临时改包名绕过注册。
3. 连接已登记的 GT6，选择 `entry/default/debug`。
4. Build Hap 后安装并启动。
5. 保存安装日志；只记录稳定错误码，涂去 UDID、证书路径和账号信息。

通过标准：签名 HAP 可安装，首页出现，诊断页版本/SDK/Build SHA 与本次构建一致。

## 3. Probe 0：基础能力

| 步骤 | 预期 | 实际/证据 |
|---|---|---|
| 打开首页、更多、设置、诊断 | 六个页面无黑屏/崩溃 | |
| 保存一次设置 | 成功回调后才返回首页 | |
| 制造/观察保存失败 | 留在原页并显示错误 | |
| 点击立即活动 | commit 成功后进入活动页并震动 | |
| 完成/跳过活动 | commit 成功后返回首页 | |
| 退出重开 | 设置与 revision 恢复 | |
| 重启手表后重开 | 状态恢复或明确错误 | |

## 4. 交付能力矩阵

当前构建预期显示 `ManualOnly / Unsupported`。没有新的已确认系统提醒适配器时，不应出现“可靠计划已启用”。

| 场景 | 时间/误差 | 触发 | 震动 | UI | 日志/错误码 |
|---|---:|---|---|---|---|
| 应用前台 | | | | | |
| 返回表盘 | | | | | |
| 息屏 | | | | | |
| 应用退出 | | | | | |
| 手机断连 | | | | | |
| 手表重启 | | | | | |
| 免打扰 | | | | | |
| 低电量 | | | | | |

## 5. 结果裁决

- `StandaloneApproved`：全部关键后台矩阵通过并有 GT6 证据。
- `ApprovalRequired`：API 存在但缺 AGC/开放能力。
- `PhoneDependent`：必须实现并验证 PhoneRelay。
- `ManualOnly`：只发布手动活动体验，产品文案不得承诺后台提醒。
- `Unsupported`：停止可靠提醒版本发布。

完成后将脱敏结果更新到 `delivery/28_CAPABILITY_PROBE_STATUS.md` 和 `docs/status/CURRENT_STATE.md`。
