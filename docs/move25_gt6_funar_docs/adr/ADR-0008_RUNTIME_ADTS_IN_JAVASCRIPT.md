# ADR-0008：JavaScript 运行时代数数据类型

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

使用带 `tag` 的记录、智能构造器、显式 `Result` 和穷尽分支，模拟代数数据类型；不强行引入 TypeScript 或大型 FP 库。

## 后果

类型安全依赖构造封闭、测试和适应度函数；需避免绕过构造器创建领域值。
