# GT6 与手机数据能力探针计划

## Probe A：Lite 手表直接传感器

- 列出实际传感器；
- 记录 ID、名称、采样率、权限；
- 测试 HR、佩戴、ACC、GYRO、步数、气压；
- 前台、息屏、返回表盘、断连；
- 记录功耗；
- 不动态导入不存在模块，使用独立构建分支。

## Probe B：Android Health Service Kit

在 vivo X200 上逐项申请测试权限并读取：

- 步数/活动；
- 运动记录；
- HR/RHR；
- 睡眠；
- SpO2；
- 压力；
- 体温；
- HRV/RRI；
- 呼吸率；
- VO2max；
- 情绪/健康记录。

对每项记录：API、scope、结果、数量、时间范围、同步延迟、来源设备。

## Probe C：Wear Engine

- 连接 GT6；
- 设备信息和消息；
- `getSensorList`；
- ACC/GYRO/MAG；
- 申请 HEALTH_SENSOR 后验证 HR/PPG/ECG；
- 记录审批和型号限制。

## Probe D：行业 SDK

只有具备主体资质后执行。把结果隔离为 partner capability，不污染公开 V1。

## 通过标准

能力必须同时满足：编译、安装、授权、真机读取、语义确认、重启/断连行为、错误码、功耗和文档证据。
