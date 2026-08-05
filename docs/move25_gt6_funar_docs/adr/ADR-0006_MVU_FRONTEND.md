# ADR-0006：MVU 前端

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 状态

接受。

## 决策

UI 使用 `Model + Msg -> Model + Commands`；更新函数纯，效果外置。

## 理由

FUNAR 将 MVU 列为函数式前端宏架构内容；它能限制业务逻辑泄漏到页面。[A2]
