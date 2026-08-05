# MVU 前端架构

> 文档体系：FUNAR × Functional DDD × Hexagonal Architecture  
> 项目：Move25 for HUAWEI WATCH GT 6  
> 版本：v2.0  
> 编制日期：2026-08-05  
> 状态：架构基线；后台提醒能力仍需 GT6 真机探针确认

## 1. 模型

```text
UiModel = {
  route,
  planStatus,
  nextBreakText,
  remainingSeconds,
  capabilityBanner,
  currentGuidance,
  errors,
  isBusy
}
```

UI 模型是领域状态的投影，不是业务事实源。

## 2. 消息

```text
Msg =
  | AppOpened(now)
  | StartPressed
  | SkipPressed
  | PauseTodayPressed
  | SettingsSaved(rawInput)
  | TickVisible(now)
  | EffectCompleted(effectId, result)
```

`TickVisible` 只允许在页面可见时更新显示；它不承担后台提醒。

## 3. 更新函数

```text
update : UiModel × Msg -> { model: UiModel, commands: UiCommand[] }
```

- 纯函数；
- 不调用系统 API；
- 不直接保存；
- 不读取全局时间；
- 任何异步结果通过消息返回。

## 4. 页面

### 首页

- 下次活动时间；
- 计划状态；
- 立即活动；
- 暂停今天；
- 设置与诊断入口。

### 活动提醒页

- “该活动了”；
- 三行以内建议；
- 开始 5 分钟；
- 跳过。

### 活动页

- 剩余时间；
- 一组动作建议；
- 提前完成。

### 设置页

使用预设值和有限选择，不在圆屏上实现复杂自由输入。

## 5. 息屏策略

- 记录 `endsAt`；
- 页面可见时计算 `max(0, endsAt - now)`；
- 页面隐藏后停止刷新；
- 不请求活动全程常亮；
- 结束提醒由系统能力决定。

## 6. 错误呈现

- 能力未确认：黄色/中性提示，不显示“已启用”；
- 注册失败：显示简短错误和“重试/诊断”；
- 不把底层错误码直接作为主文案；诊断页保留原始信息。
