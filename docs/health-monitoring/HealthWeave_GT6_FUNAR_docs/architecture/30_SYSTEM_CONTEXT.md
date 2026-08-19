# 系统上下文

```text
[GT6 Lite App]
  sensors / reminders / brief UI / cache
           │
           │ Wear Engine or platform sync
           ▼
[Huawei Health App + Huawei Cloud]
           │ Health Service Kit / Wear Engine
           ▼
[Android App - first]
  authorization / sync / local encrypted ledger / analysis / UI
           │ optional minimized payload
           ▼
[Cloud Platform]
  account(optional) / encrypted storage / algorithm jobs / AI gateway
           │
           ├── AI Provider API
           ├── Research sandbox
           └── Optional FHIR export
```

## 信任边界

- 手表与手机；
- 华为运动健康与本应用；
- 手机本地与自有云；
- 自有云与第三方 AI；
- 生产与研究环境。

每跨越一次边界都需要认证、最小权限、加密、审计和目的限制。
