# Android 首发架构

## 1. 技术建议

- Kotlin；
- Jetpack Compose；
- WorkManager；
- Room + SQLCipher/Android Keystore；
- Hilt/Koin 仅用于效果外壳；领域函数不依赖容器；
- Kotlin Coroutines/Flow 作为异步传输，不把 Flow 当领域模型；
- Python/R 算法先在云端或离线研究环境运行，生产前评估 Kotlin/ONNX 移植。

## 2. 模块

```text
:domain-types
:domain-workflows
:domain-algorithms
:ports
:adapter-huawei-health
:adapter-wear-engine
:adapter-health-connect
:adapter-room
:adapter-ai-http
:app-android
:contract-tests
```

## 3. vivo X200 特别处理

- 指导用户允许华为运动健康和本应用后台运行；
- 记录最近同步时间；
- 提供“打开华为运动健康并同步”的故障排除；
- WorkManager 只能负责本应用任务，不能强制华为运动健康同步；
- UI 显示数据新鲜度，避免过期数据被误读为当天状态。

## 4. 本地优先

原始时间线和分析结果保存在本地；云端是可选扩展。离线时仍可查看、分析已同步数据和生成确定性摘要。
