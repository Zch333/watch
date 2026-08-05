# GT6 与华为开放接口能力矩阵

## 1. 结论摘要

**是，华为开放了一部分健康/传感器接口给穿戴和手机应用；但 GT6 手表应用不能默认访问手表产生的全部健康数据。**

最稳妥的实现是三层数据平面：

- **A：Lite Wearable 直接传感器层**——短时、实时、低层数据；
- **B：Health Service Kit 健康时间线层**——用户授权后的历史和平台计算数据；
- **C：Wear Engine / Health Industry SDK 增强层**——实时通信、受限人体传感器、行业设备控制。

## 2. A 层：手表应用直接能力

官方 Lite Wearable 概览明确列出佩戴状态和心率订阅，并支持穿戴与手机的数据互通。公开 Lite `@system.sensor` 能力通常包括下列类型，但必须以当前 GT6 Compatible SDK 和真机返回为准：

| 类型 | 潜在用途 | 关键限制 |
|---|---|---|
| 心率 | 前台会话、运动反馈 | 不等同原始 PPG 或 RRI |
| 佩戴状态 | 数据有效性、暂停采样 | 不能证明贴合质量 |
| 加速度计 | 活动、手势、运动伪影 | 高采样持续开启耗电明显 |
| 陀螺仪 | 姿态、动作 | 同上 |
| 计步器 | 当日活动 | 语义和重置时点需验证 |
| 气压计 | 海拔趋势 | 气压受天气影响 |
| 设备方向 | UI/姿态 | 非健康指标 |
| 磁力计/指南针 | 方向 | 受磁场干扰 |
| 环境光/接近 | UI/场景 | 不作为生理指标 |

GT6 硬件还包含温度传感器、光学心率、GNSS 等，但“硬件存在”不能推导出 Lite 三方应用可直接订阅相应原始数据。

## 3. B 层：Health Service Kit

Health Service Kit 支持 Android、iOS、Web、HarmonyOS 等接入形态。应用只能访问两类权限的交集：平台批准的数据范围与用户实际授权范围。

适合获取：

- 历史心率、静息心率、睡眠、活动、运动记录；
- SpO2、压力、体温、HRV、呼吸率等实际开放数据；
- VO2max、运动心率、恢复心率、位置、配速、功率等运动数据；
- 部分健康记录和用户录入数据。

注意：数据类型目录很宽，但具体设备是否产生、账号地区是否支持、应用是否获批、手机是否及时同步，都需要运行时能力矩阵。

## 4. C 层：Wear Engine

手机侧 Wear Engine 可获取连接设备、健康状态、通信和传感器列表。官方当前传感器文档将：

- ECG、PPG、HR 归为 `HEALTH_SENSOR`；
- ACC、GYRO、MAG 归为 `MOTION_SENSOR`；
- 人体传感器能力标注为受限开放，且需申请权限和用户授权。

它可能允许没有对应手表应用时由手机控制传感器，但依赖华为运动健康连接、型号支持和审批。

## 5. C+ 层：Health Industry SDK

行业 SDK 文档列出心率、睡眠、SpO2、压力、体温、睡眠呼吸、脉搏波心律失常、运动、日常活动、实时 PPG/ACC/GYRO、SOS、跌倒等能力；Android 路线还出现血压、ECG、RRI/HRV 等。该范围不能直接等同于普通三方消费应用：

- 必须申请行业服务；
- 有支持设备清单；
- 可能要求企业资质、场景审核和专门签名；
- 不应成为 MVP 的硬依赖。

## 6. 必做探针

对每个目标数据建立以下状态：

```text
CapabilityStatus =
  Unknown
  | ApiAbsent
  | PermissionRequired
  | ApprovalRequired
  | DeviceUnsupported
  | UserDenied
  | Available(metadata)
  | TemporarilyUnavailable(reason)
```

不得用静态“支持列表”替代运行时探测和审计记录。
