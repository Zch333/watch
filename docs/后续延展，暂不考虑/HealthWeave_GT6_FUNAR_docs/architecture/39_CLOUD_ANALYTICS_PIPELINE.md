# 云端分析管道

## 1. 什么时候需要云

- Python/R 开源算法；
- 长时间范围计算；
- 模型推理；
- 多设备同步；
- AI API 网关；
- 研究沙箱。

## 2. 管道

```text
Encrypted upload
→ schema validation
→ malware/size checks
→ de-identification
→ canonical ledger
→ quality jobs
→ feature jobs
→ baseline/anomaly jobs
→ insight composer
→ AI gateway
→ output validation
→ signed result returned to phone
```

## 3. 作业属性

- 幂等；
- 输入和输出哈希；
- 版本锁定；
- 可取消；
- 资源限额；
- 不把失败吞掉；
- 支持重放。

## 4. 多租户

个人项目可先单用户部署，但数据模型保留 `subjectId` 与 `tenantId`。禁止用真实姓名作为对象键和日志标签。
