# 信号与数据质量管道

## 1. 顺序

```text
schema/value checks
→ timestamp checks
→ wear/contact checks
→ sampling checks
→ artifact detection
→ window acceptance
→ quality annotation
```

## 2. PPG

- 检查饱和、平线、峰值可检测性、周期一致性；
- 与 ACC 同步识别运动伪影；
- 评估脉搏形态稳定性；
- 不合格窗口不计算 PRV、血管形态和呼吸代理指标。

## 3. ACC/GYRO

- 单位和坐标轴；
- 采样间隔和丢包；
- 重力分量和校准；
- 非佩戴与设备放桌面；
- 固件或采样率变化。

## 4. 平台聚合数据

即使没有原始信号，也要评估：覆盖率、同步延迟、缺失、重复、设备来源、测量模式和上下文。

## 5. 输出

质量输出是结构化对象，不是仅一个“有效/无效”布尔值，供不同算法选择自己的准入策略。
