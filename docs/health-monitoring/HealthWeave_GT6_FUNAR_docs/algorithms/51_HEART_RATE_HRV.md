# 心率、静息心率与 HRV/PRV

## 心率

- 分离静息、睡眠、日常和运动场景；
- 使用中位数、分位数和覆盖率，避免单个尖峰主导；
- 异常首先检查佩戴、运动、温度和同步。

## 静息心率

建立相同时间/状态下的个人基线，例如夜间或清晨静息窗口。不要把厂商 RHR 与自行计算 RHR 混为一项。

## HRV/PRV 输入门禁

```text
if vendor HRV with defined semantics:
  store as VendorMetric
elif validated RRI/NN intervals available:
  compute HRV
elif high-quality raw PPG with beat intervals available:
  compute PRV and label as PRV
else:
  do not estimate HRV from low-frequency HR samples
```

## 指标

- RMSSD、SDNN、pNN50（需合格间期）；
- 频域指标要求足够时长、均匀处理和明确方法；
- 非线性指标只在样本量和验证足够时使用。

## 产品表达

强调相对个人基线和同条件比较。单日降低可能与运动、睡眠、饮酒、压力、感染、温度和测量误差相关，不用于确诊。
