package com.move25.health.ui

import com.move25.health.domain.*

enum class AppSection(val label: String, val shortLabel: String) {
    TODAY("今日", "今日"), DATA("健康数据", "数据"), REPORTS("洞察报告", "报告"), AI("AI 健康助手", "AI"), DEVICES("穿戴设备", "设备"), PRIVACY("隐私与设置", "设置")
}

data class MetricTile(val id: String, val label: String, val value: String, val unit: String, val status: String)
data class DeviceTile(val id: String, val name: String, val model: String, val state: String, val battery: String)
data class ChatBubble(val id: Long, val role: String, val text: String, val model: String? = null)
data class ReportTile(val period: String, val generatedBy: String, val summaries: List<MetricTile>, val limitation: String)

data class HealthUiModel(
    val section: AppSection = AppSection.TODAY,
    val releaseEnabled: Boolean,
    val userEnabled: Boolean = false,
    val aiEnabled: Boolean = false,
    val researchEnabled: Boolean = false,
    val appFunctionsEnabled: Boolean = false,
    val activation: Activation = Activation.Dormant("LOADING"),
    val capabilities: Map<String, Capability> = emptyMap(),
    val metrics: List<MetricTile> = emptyList(),
    val devices: List<DeviceTile> = emptyList(),
    val report: ReportTile? = null,
    val chat: List<ChatBubble> = emptyList(),
    val agentCapability: Capability = Capability.Unknown,
    val realtimeHeartRate: String? = null,
    val deleteConfirmationVisible: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
)

sealed interface HealthUiAction {
    data class SelectSection(val section: AppSection) : HealthUiAction
    data class SetHealthEnabled(val enabled: Boolean) : HealthUiAction
    data class SetAiEnabled(val enabled: Boolean) : HealthUiAction
    data class SetAppFunctionsEnabled(val enabled: Boolean) : HealthUiAction
    data class AskAgent(val prompt: String) : HealthUiAction
    data class GenerateReport(val period: String) : HealthUiAction
    data object StartRealtimeHeartRate : HealthUiAction
    data object StopRealtimeHeartRate : HealthUiAction
    data class AuthorizeGroup(val groupId: String) : HealthUiAction
    data class RevokeGroup(val groupId: String) : HealthUiAction
    data object EnableManualEntries : HealthUiAction
    data class RecordManual(val kind: ObservationKind, val primary: String, val secondary: String = "") : HealthUiAction
    data object RefreshCapabilities : HealthUiAction
    data object SyncNow : HealthUiAction
    data object ExportData : HealthUiAction
    data object DeleteData : HealthUiAction
    data object CancelDelete : HealthUiAction
    data object ConfirmDelete : HealthUiAction
    data object DismissMessage : HealthUiAction
}

fun update(model: HealthUiModel, action: HealthUiAction): HealthUiModel = when (action) {
    is HealthUiAction.SelectSection -> model.copy(section = action.section, message = null)
    is HealthUiAction.SetHealthEnabled -> model.copy(userEnabled = action.enabled)
    is HealthUiAction.SetAiEnabled -> model.copy(aiEnabled = action.enabled)
    is HealthUiAction.SetAppFunctionsEnabled -> model.copy(appFunctionsEnabled = action.enabled)
    is HealthUiAction.AskAgent -> model.copy(busy = true, message = null, chat = model.chat + ChatBubble(model.chat.maxOfOrNull { it.id }?.plus(1) ?: 1, "user", action.prompt))
    is HealthUiAction.GenerateReport, HealthUiAction.StartRealtimeHeartRate, is HealthUiAction.AuthorizeGroup, is HealthUiAction.RevokeGroup, HealthUiAction.EnableManualEntries, is HealthUiAction.RecordManual -> model.copy(busy = true, message = null)
    HealthUiAction.StopRealtimeHeartRate -> model.copy(realtimeHeartRate = null, busy = false, message = "实时心率会话已停止。")
    HealthUiAction.RefreshCapabilities, HealthUiAction.SyncNow, HealthUiAction.ExportData -> model.copy(busy = true, message = null)
    HealthUiAction.DeleteData -> model.copy(deleteConfirmationVisible = true, message = null)
    HealthUiAction.CancelDelete -> model.copy(deleteConfirmationVisible = false)
    HealthUiAction.ConfirmDelete -> model.copy(deleteConfirmationVisible = false, busy = true)
    HealthUiAction.DismissMessage -> model.copy(message = null)
}
