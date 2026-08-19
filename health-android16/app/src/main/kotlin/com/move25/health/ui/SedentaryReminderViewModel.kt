package com.move25.health.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.move25.health.HealthGraph
import com.move25.health.adapter.android.SystemClockAdapter
import com.move25.health.application.CheckSedentaryReminderUseCase
import com.move25.health.application.ConfigureSedentaryReminderUseCase
import com.move25.health.application.SedentaryReminderRun
import com.move25.health.application.SnoozeSedentaryReminderUseCase
import com.move25.health.domain.Activation
import com.move25.health.domain.QuietHours
import com.move25.health.domain.Result
import com.move25.health.domain.SedentaryReminderSettings
import com.move25.health.domain.SedentarySuppressionReason
import com.move25.health.domain.SubjectId
import com.move25.health.domain.activationState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class SedentaryReminderViewModel(private val graph: HealthGraph) : ViewModel() {
    private val subjectId = SubjectId("current")
    private val clock = SystemClockAdapter()
    private val local = MutableStateFlow(SedentaryReminderUiModel())
    private val checkReminder = CheckSedentaryReminderUseCase(
        timeline = graph.android.timeline,
        consents = graph.android.consents,
        settings = graph.sedentary.settings,
        state = graph.sedentary.state,
        notifications = graph.sedentary.notifications,
        notificationPermission = graph.sedentary.notificationPermission,
        localTime = graph.sedentary.localTime,
        clock = clock,
        audit = graph.android.audit,
    )
    private val configureReminder = ConfigureSedentaryReminderUseCase(
        settings = graph.sedentary.settings,
        state = graph.sedentary.state,
        schedule = graph.sedentary.schedule,
    )
    private val snoozeReminder = SnoozeSedentaryReminderUseCase(
        settings = graph.sedentary.settings,
        state = graph.sedentary.state,
        clock = clock,
    )

    val state: StateFlow<SedentaryReminderUiModel> = combine(
        local,
        graph.sedentary.settings.observeSettings(),
        graph.sedentary.state.observeState(),
        graph.android.flags.observeUserEnabled(),
    ) { model, settings, reminderState, userEnabled ->
        model.copy(
            settings = settings,
            reminderState = reminderState,
            activation = activationState(graph.releaseEnabled, userEnabled, graph.releaseEvidence),
            notificationPermissionGranted = graph.sedentary.notificationPermission.isGranted(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), local.value)

    fun dispatch(action: SedentaryReminderUiAction) {
        if (
            action is SedentaryReminderUiAction.RequestNotificationPermission &&
            state.value.activation !is Activation.Active
        ) {
            local.update { it.copy(message = "健康监测未激活，不会请求通知权限。") }
            return
        }

        val currentSettings = state.value.settings
        local.update { updateSedentaryReminderUi(it, action) }
        when (action) {
            is SedentaryReminderUiAction.SetEnabled -> saveSettings(
                currentSettings.copy(enabled = action.enabled),
                requestPermissionAfterSave = action.enabled,
            )
            is SedentaryReminderUiAction.SetThreshold -> saveSettings(
                currentSettings.copy(thresholdMinutes = action.minutes.coerceIn(30, 180)),
            )
            is SedentaryReminderUiAction.SetQuietHoursEnabled -> saveSettings(
                currentSettings.copy(quietHours = if (action.enabled) QuietHours.Overnight else null),
            )
            SedentaryReminderUiAction.CheckNow -> viewModelScope.launch { runCheck() }
            SedentaryReminderUiAction.SnoozeThirtyMinutes -> viewModelScope.launch {
                when (val result = snoozeReminder(30)) {
                    is Result.Ok -> local.update {
                        it.copy(busy = false, message = "已暂停 30 分钟。")
                    }
                    is Result.Err -> local.update {
                        it.copy(busy = false, message = "暂停失败：${result.error.code}")
                    }
                }
            }
            is SedentaryReminderUiAction.NotificationPermissionResult -> {
                if (action.granted) viewModelScope.launch { runCheck() }
            }
            SedentaryReminderUiAction.RequestNotificationPermission,
            SedentaryReminderUiAction.NotificationPermissionRequestConsumed,
            SedentaryReminderUiAction.DismissMessage -> Unit
        }
    }

    private fun saveSettings(
        newSettings: SedentaryReminderSettings,
        requestPermissionAfterSave: Boolean = false,
    ) {
        viewModelScope.launch {
            val active = state.value.activation is Activation.Active
            when (val result = configureReminder(newSettings, active)) {
                is Result.Err -> local.update {
                    it.copy(busy = false, message = "久坐提醒设置保存失败：${result.error.code}")
                }
                is Result.Ok -> local.update { model ->
                    model.copy(
                        busy = false,
                        requestNotificationPermission = requestPermissionAfterSave && active &&
                            !graph.sedentary.notificationPermission.isGranted(),
                        message = when {
                            !newSettings.enabled -> "久坐提醒已关闭，后台任务已取消。"
                            !active -> "设置已保存；健康发布门禁未通过，后台提醒不会启动。"
                            else -> "久坐提醒已更新。"
                        },
                    )
                }
            }
        }
    }

    private suspend fun runCheck() {
        when (val result = checkReminder(subjectId, state.value.activation)) {
            is Result.Err -> local.update {
                it.copy(busy = false, message = "久坐检查失败：${result.error.code}")
            }
            is Result.Ok -> when (val outcome = result.value) {
                is SedentaryReminderRun.Delivered -> local.update {
                    it.copy(
                        busy = false,
                        message = "已发布久坐提醒：约 ${outcome.sedentaryMinutes} 分钟低活动。",
                    )
                }
                is SedentaryReminderRun.Suppressed -> local.update { model ->
                    model.copy(
                        busy = false,
                        requestNotificationPermission = outcome.reason ==
                            SedentarySuppressionReason.NOTIFICATION_PERMISSION_REQUIRED &&
                            state.value.activation is Activation.Active,
                        message = suppressionMessage(outcome.reason),
                    )
                }
            }
        }
    }

    private fun suppressionMessage(reason: SedentarySuppressionReason): String = when (reason) {
        SedentarySuppressionReason.FEATURE_DISABLED -> "久坐提醒未开启。"
        SedentarySuppressionReason.MONITORING_DORMANT -> "健康监测仍处于休眠状态。"
        SedentarySuppressionReason.CONSENT_REQUIRED -> "需要先授权 activity 健康数据组。"
        SedentarySuppressionReason.QUIET_HOURS -> "当前处于 22:00-07:00 免打扰时段。"
        SedentarySuppressionReason.SNOOZED -> "久坐提醒已暂停。"
        SedentarySuppressionReason.COOLDOWN -> "最近已提醒，冷却期内不重复发布。"
        SedentarySuppressionReason.NO_QUALIFIED_DATA -> "暂无合格的连续久坐数据。"
        SedentarySuppressionReason.STALE_DATA -> "久坐数据已过期，请先同步。"
        SedentarySuppressionReason.RECENT_MOVEMENT -> "检测到最近活动，本次不提醒。"
        SedentarySuppressionReason.BELOW_THRESHOLD -> "低活动时长尚未达到阈值。"
        SedentarySuppressionReason.NOTIFICATION_PERMISSION_REQUIRED -> "需要通知权限才能发布提醒。"
    }

    companion object {
        fun factory(graph: HealthGraph): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                SedentaryReminderViewModel(graph) as T
        }
    }
}
