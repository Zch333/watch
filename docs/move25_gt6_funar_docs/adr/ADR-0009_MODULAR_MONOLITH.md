# ADR-0009：单 HAP 模块化单体

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

领域边界实现为模块，不拆微服务和远程调用。

## 理由

产品为单用户离线手表应用，没有分布式部署收益。DDD 边界用于语义隔离，不用于制造基础设施。
