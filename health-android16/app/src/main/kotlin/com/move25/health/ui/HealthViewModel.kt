package com.move25.health.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.move25.health.HealthGraph
import com.move25.health.application.*
import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class HealthViewModel(private val graph: HealthGraph) : ViewModel() {
    private val subjectId = SubjectId("current")
    private val agent = RunHealthAgentUseCase(graph.localAgent, graph.cloudAgent)
    private val clock = object : ClockPort { override fun now() = InstantMs(System.currentTimeMillis()) }
    private val ids = object : IdPort { override fun next(prefix: String) = "$prefix:${java.util.UUID.randomUUID()}" }
    private val local = MutableStateFlow(HealthUiModel(releaseEnabled = graph.releaseEnabled))
    private var realtimeJob: Job? = null
    private val flags = combine(
        graph.android.flags.observeUserEnabled(),
        graph.android.flags.observeAiEnabled(),
        graph.android.flags.observeResearchEnabled(),
        graph.android.flags.observeAppFunctionsEnabled(),
    ) { user, ai, research, appFunctions -> listOf(user, ai, research, appFunctions) }
    private val liveMetrics = graph.android.metrics.observe(subjectId, emptySet(), null)
    val state: StateFlow<HealthUiModel> = combine(
        local,
        flags,
        graph.android.capabilities.observeAll(),
        liveMetrics,
    ) { model, flagValues, capabilities, metrics ->
        val user = flagValues[0]
        model.copy(userEnabled = user, aiEnabled = flagValues[1], researchEnabled = flagValues[2], appFunctionsEnabled = flagValues[3],
            capabilities = capabilities, metrics = metrics.takeLast(12).map(::tile),
            activation = activationState(graph.releaseEnabled, user, graph.releaseEvidence))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), local.value)

    fun dispatch(action: HealthUiAction) {
        local.update { update(it, action) }
        when (action) {
            is HealthUiAction.SetHealthEnabled -> viewModelScope.launch {
                graph.android.flags.setUserEnabled(action.enabled)
                if (!action.enabled) { realtimeJob?.cancel(); realtimeJob = null }
                if (!action.enabled) local.update { it.copy(message = "健康能力保持关闭，后台同步与传感器会话已禁止。") }
                else if (!graph.releaseEnabled) local.update { it.copy(message = "偏好已保存；产品总门禁尚未开放，因此不会开始采集。") }
            }
            is HealthUiAction.SetAiEnabled -> viewModelScope.launch {
                val consent = if (action.enabled) graph.android.consents.grant(
                    subjectId,
                    AI_PURPOSE,
                    setOf(DataScope("verified_wellness_summary", null)),
                    clock.now(),
                ) else graph.android.consents.revoke(subjectId, AI_PURPOSE, clock.now())
                if (consent is Result.Ok) graph.android.flags.setAiEnabled(action.enabled)
                local.update { it.copy(message = when {
                    consent is Result.Err -> "AI 同意状态保存失败：${consent.error.code}"
                    action.enabled -> "已同意 AI 解释最小化的已验证摘要；原始高频信号不会交给模型。"
                    else -> "AI 同意已撤回，AI 解释已关闭。"
                }) }
            }
            is HealthUiAction.SetAppFunctionsEnabled -> viewModelScope.launch {
                val consent = if (action.enabled) graph.android.consents.grant(subjectId, APP_FUNCTION_PURPOSE,
                    setOf(DataScope("aggregated_wellness_summary", null)), clock.now())
                else graph.android.consents.revoke(subjectId, APP_FUNCTION_PURPOSE, clock.now())
                if (consent is Result.Ok) graph.android.flags.setAppFunctionsEnabled(action.enabled)
                local.update { it.copy(message = when {
                    consent is Result.Err -> "系统智能工具同意状态保存失败：${consent.error.code}"
                    action.enabled -> "已同意系统读取聚合健康摘要；只有全部门禁通过后才会对系统可见。"
                    else -> "系统智能工具同意已撤回并关闭。"
                }) }
            }
            is HealthUiAction.AskAgent -> viewModelScope.launch { askAgent(action.prompt) }
            is HealthUiAction.GenerateReport -> viewModelScope.launch { generateReport(action.period) }
            HealthUiAction.StartRealtimeHeartRate -> startRealtimeHeartRate()
            HealthUiAction.StopRealtimeHeartRate -> { realtimeJob?.cancel(); realtimeJob = null }
            is HealthUiAction.AuthorizeGroup -> viewModelScope.launch { authorize(action.groupId) }
            is HealthUiAction.RevokeGroup -> viewModelScope.launch { revoke(action.groupId) }
            HealthUiAction.EnableManualEntries -> viewModelScope.launch { enableManualEntries() }
            is HealthUiAction.RecordManual -> viewModelScope.launch { recordManual(action) }
            HealthUiAction.RefreshCapabilities -> viewModelScope.launch { probeCapabilities() }
            HealthUiAction.SyncNow -> viewModelScope.launch { synchronize() }
            HealthUiAction.ExportData -> viewModelScope.launch { export() }
            HealthUiAction.ConfirmDelete -> viewModelScope.launch { delete() }
            else -> Unit
        }
    }

    private suspend fun probeCapabilities() {
        if (!graph.releaseEnabled) {
            local.update { it.copy(busy = false, message = "产品总门禁关闭；为避免触发任何华为 SDK/网络行为，本次未执行探针。") }
            return
        }
        val result = graph.huawei.capabilities()
        val now = InstantMs(System.currentTimeMillis())
        result.forEach { (id, capability) -> graph.android.capabilities.put(id, capability, now) }
        val localAi = graph.localAgent.capability()
        val devices = when (val queried = graph.watchSensors?.devices()) {
            is Result.Ok -> queried.value.map { DeviceTile(it.idPseudonym, it.name, it.model,
                if (it.connected) "已连接" else "未连接", it.batteryPercent?.let { value -> "$value%" } ?: "未知") }
            else -> emptyList()
        }
        local.update { it.copy(busy = false, agentCapability = localAi, devices = devices, message = "能力探针完成；结果不会自动授权或开始采集。") }
    }

    private suspend fun synchronize() {
        if (state.value.activation !is Activation.Active) {
            local.update { it.copy(busy = false, message = dormantMessage("同步")) }
            return
        }
        val end = System.currentTimeMillis()
        val interval = TimeInterval.of(end - 30L * 86_400_000, end).getOrNull() ?: run {
            local.update { it.copy(busy = false, message = "同步区间无效。") }
            return
        }
        val useCase = SyncHealthDataUseCase(graph.huawei, graph.android.timeline, graph.android.consents, graph.android.cursors,
            clock, graph.android.audit, graph.android.quarantine)
        var inserted = 0
        var failed = 0
        huaweiDataPlan.forEach { group -> when (val result = useCase(subjectId, group, interval)) {
            is Result.Ok -> inserted += result.value.inserted
            is Result.Err -> failed++
        } }
        val analysis = AnalyzeSynchronizedDataUseCase(graph.android.timeline, graph.android.metrics, graph.algorithms)(subjectId, interval)
        val computed = (analysis as? Result.Ok)?.value?.computedMetrics ?: 0
        local.update { it.copy(busy = false, message = "同步完成：新增 $inserted 条、生成 $computed 个确定性指标；$failed 个数据组未满足授权/能力条件。") }
    }

    private suspend fun export() {
        when (val result = graph.android.exports.exportJson(subjectId)) {
            is Result.Ok -> UiEventBus.emit(UiEvent.Export(result.value))
            is Result.Err -> local.update { it.copy(message = "导出失败：${result.error.code}") }
        }
        local.update { it.copy(busy = false) }
    }

    private suspend fun delete() {
        val result = DeleteSubjectDataUseCase(graph.huawei, graph.android.timeline, graph.cloudDeletion,
            graph.android.consents, graph.android.audit, clock)(subjectId)
        if (result is Result.Ok) {
            graph.android.flags.setAiEnabled(false)
            graph.android.flags.setAppFunctionsEnabled(false)
        }
        local.update { it.copy(busy = false, message = if (result is Result.Ok)
            if (graph.cloudDeletion == null) "本机数据、派生结果和同意已删除；当前未配置 Move25 云端，因此没有远端副本。" else "本机与云端删除已确认。"
            else "删除未完全确认：${(result as Result.Err).error.code}") }
    }

    private suspend fun askAgent(prompt: String) {
        if (prompt.isBlank()) { local.update { it.copy(busy = false, message = "请输入问题。") }; return }
        val active = state.value.activation is Activation.Active
        if (!active || !state.value.aiEnabled) {
            local.update { it.copy(busy = false, message = if (!active) dormantMessage("AI 分析") else "AI 开关关闭。") }
            return
        }
        if (graph.android.consents.activeConsent(subjectId, AI_PURPOSE) == null) {
            graph.android.flags.setAiEnabled(false)
            local.update { it.copy(busy = false, message = "AI 同意不存在或已撤回。") }
            return
        }
        val metrics = when (val result = graph.android.metrics.query(subjectId, emptySet(), null)) {
            is Result.Ok -> result.value
            is Result.Err -> emptyList()
        }
        val report = summarizePeriod("weekly", metrics.takeLast(30), emptyList()).getOrNull()?.let { health ->
            DeterministicReport("近期待验证健康摘要", Confidence.MEDIUM,
                health.summaries.map { "${it.metricId.value}：中位数 ${it.median} ${it.unit.name}，样本 ${it.sampleCount}" },
                listOf("保持一致测量条件并观察 7 天趋势。"), emptyList(), listOf(WELLNESS_DISCLAIMER))
        } ?: DeterministicReport("暂无合格数据", Confidence.LOW, emptyList(), emptyList(), emptyList(), listOf(WELLNESS_DISCLAIMER, "当前没有可供解释的合格派生指标。"))
        val (localCapability, cloudCapability) = agent.capability()
        val route = chooseAgentRoute(AgentPolicyInput(active, true, true, localCapability, cloudCapability, report.redFlags.isNotEmpty()))
        agent.run(route, AgentRequest("mobile-session", subjectId, prompt, report, "zh-CN")).collect { result ->
            when (result) {
                is Result.Err -> local.update { it.copy(message = "AI 未采用：${result.error.code}") }
                is Result.Ok -> if (!result.value.partial) local.update { model -> model.copy(chat = model.chat + ChatBubble(model.chat.maxOfOrNull { it.id }?.plus(1) ?: 1, "assistant", result.value.text, result.value.model)) }
            }
        }
        local.update { it.copy(busy = false) }
    }

    private suspend fun generateReport(period: String) {
        if (state.value.activation !is Activation.Active) {
            local.update { it.copy(busy = false, message = dormantMessage("生成报告")) }
            return
        }
        val days = when (period) { "daily" -> 1L; "weekly" -> 7L; "monthly" -> 30L; else -> 0L }
        if (days == 0L) { local.update { it.copy(busy = false, message = "报告周期无效。") }; return }
        val end = clock.now().value
        val interval = TimeInterval.of(end - days * DAY_MS, end).getOrNull() ?: return
        when (val result = GenerateReportUseCase(graph.android.metrics)(subjectId, period, interval, emptyList())) {
            is Result.Err -> local.update { it.copy(busy = false, message = "报告生成失败：${result.error.code}") }
            is Result.Ok -> local.update { model -> model.copy(busy = false, report = ReportTile(
                result.value.period,
                result.value.generatedBy,
                result.value.summaries.map { summary -> MetricTile(summary.metricId.value, summary.metricId.value.replace('_', ' '),
                    "%.1f".format(summary.median), summary.unit.name, "${summary.sampleCount} 条合格样本") },
                "相关不等于因果；报告只用于健康管理，不用于诊断。",
            ), message = if (result.value.summaries.isEmpty()) "报告已生成，但该周期没有合格指标。" else "报告已由确定性引擎生成。") }
        }
    }

    private fun startRealtimeHeartRate() {
        realtimeJob?.cancel()
        realtimeJob = viewModelScope.launch {
            if (state.value.activation !is Activation.Active) {
                local.update { it.copy(busy = false, message = dormantMessage("实时心率")) }
                return@launch
            }
            val consent = graph.android.consents.activeConsent(subjectId, "health:heart_rate")
            if (consent == null) {
                local.update { it.copy(busy = false, message = "请先完成 heart_rate 数据组授权。") }
                return@launch
            }
            val sessionId = ids.next("realtime-heart-rate")
            graph.realtimeHeartRate.observe(RealtimeHeartRateRequest(subjectId, sessionId, 300, consent)).collect { result ->
                when (result) {
                    is Result.Err -> local.update { it.copy(busy = false, message = "实时心率不可用：${result.error.code}") }
                    is Result.Ok -> local.update { it.copy(busy = false,
                        realtimeHeartRate = "%.0f BPM".format(result.value.beatsPerMinute),
                        message = null) }
                }
            }
            local.update { it.copy(busy = false, message = "实时心率会话已结束（最长 5 分钟）。") }
        }
    }

    private suspend fun authorize(groupId: String) {
        if (state.value.activation !is Activation.Active) {
            local.update { it.copy(busy = false, message = dormantMessage("授权")) }
            return
        }
        val useCase = AuthorizeDataGroupUseCase(graph.huawei, graph.android.consents, clock)
        val message = when (val result = useCase(subjectId, groupId)) {
            is Result.Ok -> "$groupId 已获用户授权。"
            is Result.Err -> "授权未完成：${result.error.code}"
        }
        local.update { it.copy(busy = false, message = message) }
    }

    private suspend fun revoke(groupId: String) {
        val message = when (val result = RevokeDataGroupUseCase(graph.huawei, graph.android.consents, clock)(subjectId, groupId)) {
            is Result.Ok -> "$groupId 授权已撤销。"
            is Result.Err -> "撤销未完成：${result.error.code}"
        }
        local.update { it.copy(busy = false, message = message) }
    }

    private suspend fun enableManualEntries() {
        val result = graph.android.consents.grant(subjectId, "manual_health_entry", setOf(DataScope("manual_health_entry", null)), clock.now())
        local.update { it.copy(busy = false, message = if (result is Result.Ok) "手工健康记录已授权。" else "手工记录授权失败。") }
    }

    private suspend fun recordManual(action: HealthUiAction.RecordManual) {
        val primary = action.primary.toDoubleOrNull()
        val input = when (action.kind) {
            ObservationKind.MOOD -> ManualObservationInput(action.kind, ObservationValue.Category(action.primary), UnitCode.SCORE, clock.now())
            ObservationKind.MENSTRUAL_CYCLE -> ManualObservationInput(action.kind, ObservationValue.Category(action.primary), UnitCode.UNITLESS, clock.now())
            ObservationKind.EXTERNAL_BLOOD_PRESSURE -> {
                val secondary = action.secondary.toDoubleOrNull()
                if (primary == null || secondary == null) null else ManualObservationInput(action.kind, ObservationValue.BloodPressure(primary, secondary), UnitCode.MILLIMETER_MERCURY, clock.now())
            }
            ObservationKind.EXTERNAL_BLOOD_GLUCOSE -> primary?.let { ManualObservationInput(action.kind, ObservationValue.Scalar(it), UnitCode.MILLIMOLE_PER_LITER, clock.now()) }
            else -> null
        }
        if (input == null) { local.update { it.copy(busy = false, message = "输入格式无效。") }; return }
        val result = RecordManualObservationUseCase(graph.android.timeline, graph.android.consents, clock, ids)(subjectId, input)
        local.update { it.copy(busy = false, message = if (result is Result.Ok) "记录已加密保存。" else "记录失败：${(result as Result.Err).error.code}") }
    }

    private fun tile(metric: DerivedMetric) = MetricTile(metric.metricId.value, metric.metricId.value.replace('_', ' '),
        "%.1f".format(metric.value), metric.unit.name, if (metric.quality is DataQuality.Good) "质量良好" else "质量降级")

    private fun dormantMessage(operation: String): String = when (state.value.activation) {
        is Activation.Active -> "$operation已排队。"
        is Activation.Dormant -> "$operation未执行：${activationReason(state.value.activation)}。"
    }

    companion object {
        private const val AI_PURPOSE = "ai_explanation"
        private const val APP_FUNCTION_PURPOSE = "app_function_summary"
        private const val DAY_MS = 86_400_000L
        fun factory(graph: HealthGraph) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = HealthViewModel(graph) as T
        }
    }
}

sealed interface UiEvent { data class Export(val artifact: ExportArtifact) : UiEvent }
object UiEventBus {
    private val events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 1)
    val flow = events.asSharedFlow()
    suspend fun emit(event: UiEvent) = events.emit(event)
}

fun activationReason(value: Activation): String = when (value) {
    is Activation.Active -> "已激活"
    is Activation.Dormant -> when (value.reason) {
        "RELEASE_GATE_DISABLED" -> "产品总门禁关闭"
        "USER_SWITCH_OFF" -> "用户开关关闭"
        "RELEASE_EVIDENCE_INCOMPLETE" -> "发布证据未全部通过"
        else -> value.reason
    }
}
