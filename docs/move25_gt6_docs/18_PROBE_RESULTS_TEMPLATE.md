# GT6 后台提醒能力探针结果

## 1. 基本信息

- 测试日期：
- 测试人员：
- App Commit：
- HAP SHA-256：
- Device：HUAWEI WATCH GT 6
- Firmware：
- DevEco Studio：
- Compatible SDK：
- Debug Phone：
- DevEco Assistant：

## 2. G0 基线

| 项目 | 结果 | 证据/错误 |
|---|---|---|
| Lite 工程构建 | Pass/Fail |  |
| signed HAP 安装 | Pass/Fail |  |
| 页面启动 | Pass/Fail |  |
| 存储 set/get | Pass/Fail |  |
| 退出后存储保留 | Pass/Fail |  |
| 短振动 | Pass/Fail |  |

## 3. 候选提醒模块

- 模块名称：
- 静态导入：Pass/Fail
- 声明文件路径：
- 设备类型标记：
- 应用模型：
- SystemCapability：
- 最低版本：
- 权限：
- AGC 开放能力：
- 编译日志：

## 4. 注册结果

- 60 秒提醒注册：Pass/Fail
- 返回 ID：
- 错误码：
- 错误消息：
- 取消单条：Pass/Fail/Unsupported
- 取消全部：Pass/Fail/Unsupported
- 查询有效提醒：Pass/Fail/Unsupported

## 5. 后台矩阵

| 场景 | 计划时间 | 实际时间 | 结果 | 备注 |
|---|---|---|---|---|
| 前台 |  |  |  |  |
| 返回表盘 |  |  |  |  |
| 熄屏 |  |  |  |  |
| 应用退出 |  |  |  |  |
| 手机蓝牙关闭 |  |  |  |  |
| 手机关机 |  |  |  |  |
| 手表重启 |  |  |  |  |
| 低电量模式 |  |  |  |  |
| 免打扰 |  |  |  |  |

## 6. 容量测试

| 数量 | 注册 | 触发 | 取消 | 错误 |
|---:|---|---|---|---|
| 1 |  |  |  |  |
| 5 |  |  |  |  |
| 15 |  |  |  |  |
| 30 |  |  |  |  |
| 75 |  |  |  |  |

## 7. 结论

- Standalone 可行：Approved / Rejected / Pending
- 推荐调度策略：
- 重启行为：
- 已知限制：
- 下一步：
