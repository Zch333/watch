# 开源许可证、模型和数据集治理

## 1. 三类许可证必须分开

- **代码许可证**：库和实现；
- **模型许可证**：权重可能与代码不同；
- **数据集许可证/同意范围**：训练数据可能禁止商业或再识别用途。

## 2. 准入检查

每个依赖必须记录：

```text
name, version, commit, SPDX, copyright,
direct/transitive dependencies,
commercial-use status,
network-service obligations,
model license,
dataset license,
export/privacy constraints,
approved-by, reviewed-at
```

## 3. 特别风险

- GPL/AGPL 与闭源移动端或云服务的组合；
- “仅研究”“非商业”模型；
- 公开论文没有公开权重；
- 模型权重来源不明；
- 数据集同意范围不允许目标用途；
- 训练数据与目标腕式设备分布不一致。

## 4. 发布门禁

没有完成 SBOM、许可证扫描、人工复核和模型卡，不允许进入生产镜像。算法独立重写也必须避免复制受版权保护实现，并应引用原论文和测试自己的正确性。
