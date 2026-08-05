# ADR-0003：函数式核心与六边形边界

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

业务规则实现为不可变数据和纯函数；所有 I/O 通过端口和适配器。工作流以函数参数注入依赖。

## 理由

提高可测试性、隔离平台不确定性，并符合 FUNAR 与 Ports & Adapters 的内外边界原则。[A1][A2][A3]
