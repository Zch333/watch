# 13｜Vibe Coding 提示词库

## 1. 使用原则

- 一次只要求 AI 完成一个阶段；
- 每次提供实际工程树和 SDK 信息；
- 不让 AI 根据“鸿蒙手表”泛化到 ArkTS Stage；
- 所有系统 API 必须能在当前 Lite SDK 中找到；
- 编译和真机结果优先于语言模型解释；
- 不把“看起来合理”的代码视为完成。

## 2. 总约束 Prompt

```text
你是一名专门研究 HUAWEI WATCH GT 系列 Lite Wearable 应用开发的高级工程师。

项目目标：为 HUAWEI WATCH GT 6 开发一款纯手表端久坐打断应用 Move25。

强制约束：
1. 目标设备是 HUAWEI WATCH GT 6，属于 Lite Wearable，不是 WATCH 5 标准 Wearable。
2. 使用 DevEco Studio 的 [Lite] Empty Ability。
3. 使用 JS FA、HML、CSS、JavaScript 和 config.json。
4. 禁止生成 ArkTS Stage、UIAbility、EntryAbility.ets、Index.ets 或 module.json5 方案。
5. 禁止把标准 Wearable 的 @kit.* API直接用于 Lite 工程，除非当前 Lite SDK 的声明文件明确支持。
6. 禁止用 setInterval、setTimeout、常驻后台或 keepAlive 实现 25 分钟长期提醒。
7. 应用不使用网络、账号、云、健康数据、GPS、心率、持续加速度计、Wear Engine 或手机配套应用。
8. 所有配置保存在手表本地。
9. 当前已确认的 Lite API包括 @system.storage 和 @system.vibrator；后台提醒接口必须以实际 SDK、AGC 权限和 GT6 真机测试为准。
10. 不得虚构模块名、权限、SystemCapability、最低版本或 GT6 支持状态。
11. 每次调用系统 API时，必须列出来源文件、导入方式、权限、设备支持和错误处理。
12. 如果信息无法确认，请明确写“待 SDK/真机验证”，不要用假代码填充。
13. 只修改本轮要求涉及的文件，不进行无关重构。
14. 输出后给出编译验证步骤和预期错误类型。
```

## 3. Prompt A：检查工程类型

```text
请检查当前工程是否为真正的 HUAWEI Lite Wearable JS FA工程。

输出：
- 工程模型判断；
- 依据的目录和配置字段；
- 是否出现 ArkTS Stage 文件；
- 当前 Compatible SDK；
- config.json 中 deviceType、abilities 和 js 配置；
- 需要修复的最小差异。

不要修改代码。不要根据项目名称推断，必须读取实际文件。
```

## 4. Prompt B：基线探针

```text
请实现 G0 基线探针，只验证：
- 页面启动；
- @system.storage 写入、读取、删除；
- @system.vibrator 短振动；
- 错误码显示。

要求：
- 使用 HML/CSS/JavaScript；
- 只申请 ohos.permission.VIBRATE；
- 保留 DevEco 生成的 config.json 结构；
- 不加入通知、后台提醒、网络或其他权限；
- 不使用 require 动态嗅探系统模块；
- 提供完整变更清单和真机测试步骤。
```

## 5. Prompt C：后台提醒编译探针

```text
请不要直接写正式提醒代码。先检查当前 Lite Wearable SDK 中是否存在可用于系统级定时提醒的公开模块。

请执行：
1. 搜索当前 SDK 的声明文件和文档索引；
2. 列出候选模块的准确名称；
3. 对每个候选模块列出：设备类型、应用模型、最低版本、SystemCapability、权限和是否需要 AGC 开放能力；
4. 将每个候选模块放到独立 Git 分支进行静态导入编译测试；
5. 不使用 try/catch require() 探测不存在的模块；
6. 不允许用标准 ArkTS Stage 示例替代 Lite JS FA 示例。

本轮只输出调查结果、分支计划和最小静态导入，不实现正式 UI。
```

## 6. Prompt D：60 秒提醒运行探针

```text
当前候选提醒模块已经在 Lite 工程中编译通过。请实现一条最小的 60 秒系统提醒。

约束：
- 只使用倒计时提醒；
- 标题 Move25 Probe；
- 正文 Timer fired；
- 不加入自定义声音、全屏跳转、两个按钮或复杂通知；
- 记录成功返回值、系统提醒 ID、错误码和错误消息；
- 提供取消当前、取消全部、查询有效提醒能力（仅在 API 确实支持时）；
- 列出需要的最小权限和 AGC 开放能力；
- 提供前台、表盘、熄屏、应用退出、手机断连和重启测试表。
```

## 7. Prompt E：日程生成器

```text
请实现纯 JavaScript 的 ScheduleGenerator，不调用任何 HarmonyOS 系统 API。

输入：
- 本地日期；
- 工作日数组；
- 多个工作块，每个用 startMinutes/endMinutes；
- focusMinutes；
- breakMinutes；
- 排除日期；
- 暂停截止时间；
- 跳过逻辑提醒 ID。

规则：
- 完整周期为 focus + break；
- breakStart = cycleStart + focus；
- 只有 breakEnd <= workBlockEnd 时才生成；
- 不使用上次实际触发时间推算下一次；
- 输出稳定 logicalId；
- 第一版不支持跨午夜；
- 避免依赖 Node.js API；
- 考虑 Lite JavaScript 运行时兼容性。

同时生成测试用例，验证默认上午6条、下午9条、周末0条和边界工作块。
```

## 8. Prompt F：存储层

```text
请使用 @system.storage 实现 SettingsStore 和 RuntimeStore。

要求：
- 使用回调式 API；
- 对对象做 JSON 序列化；
- 捕获读取失败和 JSON 解析失败；
- 提供默认值；
- 包含 schemaVersion；
- 不在每秒倒计时中写存储；
- 不使用 @ohos.data.preferences；
- 不使用浏览器 localStorage；
- 输出数据键、迁移策略和清除方法。
```

## 9. Prompt G：提醒适配器

```text
请基于已经通过 GT6 真机验证的提醒 API，实现 ReminderScheduler 适配器。

禁止重新选择或猜测其他 API。使用我提供的真实模块名、接口签名、错误码和探针结果。

对外接口：
- getCapabilities
- replaceAll
- cancelAll
- cancelByIds
- listRegistered
- scheduleBreakEnd

要求：
- 业务层不直接导入系统模块；
- 修改设置时清理旧提醒；
- 防止重复注册；
- 保存逻辑 ID 到系统 ID 映射；
- 映射统一错误码；
- 对提醒数量上限进行处理；
- 不使用后台轮询。
```

## 10. Prompt H：首页和活动页

```text
请为 Lite Wearable JS FA 创建极简圆形屏幕 UI。

页面：
1. 首页：状态、下次提醒、立即活动、暂停、设置；
2. 提醒页：该活动了、开始活动、跳过；
3. 活动页：剩余时间、三条动作建议、提前完成。

要求：
- HML + CSS + JavaScript；
- Flex 居中；
- 黑色背景；
- 关键元素远离圆形边缘；
- 不使用 ArkUI Stage 组件；
- 首页不秒级刷新；
- 活动页只在可见时更新；
- 页面隐藏时清理前台 timer；
- 活动结束以绝对时间戳恢复；
- 不阻止息屏；
- 不加入大型图片或持续动画。
```

## 11. Prompt I：测试审查

```text
请作为严格的代码审查员检查当前 Move25 Lite Wearable 项目。

重点寻找：
- 错误使用 ArkTS/Stage API；
- 不存在或未验证的系统模块；
- 长期 setInterval/setTimeout；
- 页面隐藏后未清理 timer；
- 重复提醒；
- 时区和日期错误；
- 工作块跨越和边界错误；
- 频繁存储写入；
- 无关权限；
- 网络或传感器依赖；
- 圆形屏幕裁切；
- 错误码吞掉；
- 私钥、Profile、UDID 或 HAP 被提交。

按严重程度输出 Blocking、High、Medium、Low，并给出最小修复。
```

## 12. Prompt J：华为工单

```text
我正在开发 HUAWEI WATCH GT 6 的 Lite Wearable 独立应用。

环境：
- 设备：HUAWEI WATCH GT 6
- 完整固件：<填写>
- 工程：[Lite] Empty Ability
- 模型：JS FA
- 语言：JavaScript/HML/CSS
- DevEco Studio：<填写>
- Compatible SDK：<填写>
- 开发者账号类型：<填写>

业务场景：
在用户设定的工作时间内，每完成25分钟工作，系统提醒用户活动5分钟。应用不依赖手机，不使用网络、健康数据或持续传感器。

请明确答复：
1. 普通第三方 GT6 Lite Wearable JS FA应用应使用哪个公开 API注册系统级定时提醒？
2. 该 API是否可在应用退出、进程回收和手表熄屏后触发？
3. 是否支持手机断连后的手表本地提醒？
4. 是否支持按星期重复或固定时分的提醒？
5. 单应用提醒数量上限是多少？
6. 需要哪些权限、SystemCapability 和 AppGallery Connect 开放能力？
7. 调试签名是否可验证，还是只有市场签名生效？
8. 手表重启后提醒是否保留？
9. 请提供适用于 Lite Wearable JS FA 的接口文档或示例，不要提供 WATCH 5 ArkTS Stage 示例。
```

## 13. 禁止 AI 输出的内容

除非实际 SDK 已证明，否则拒绝：

- `Index.ets`；
- `EntryAbility.ets`；
- `module.json5`；
- `@kit.BackgroundTasksKit`；
- `@kit.NotificationKit`；
- `reminderAgentManager` 直接作为既定事实；
- `@system.alarm` 从快应用文档移植；
- `setInterval(..., 25 * 60 * 1000)`；
- “开启 keepAlive 即可”；
- “打开开发者模式 Wi-Fi 直连 GT6”而无官方 Lite 依据；
- 无来源的权限和魔法数字；
- 未经验证的全屏通知、自定义按钮和后台音效。
