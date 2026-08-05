# ADR-0002：Lite Wearable 技术基线

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

以 DevEco Studio `[Lite] Empty Ability` 和实际 Lite SDK 模板为起点，不使用标准 Wearable ArkTS Stage 作为默认架构。

## 后果

- 代码和文档必须尊重 Lite JavaScript/类 Web 运行时限制；
- 标准 HarmonyOS API 只能作为候选证据，不能直接复制；
- SDK 和 GT6 真机结果优先于 AI 记忆和旧博客。
