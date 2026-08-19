package com.move25.health.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.move25.health.domain.Activation
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Move25AppRoot(
    healthViewModel: HealthViewModel,
    sedentaryViewModel: SedentaryReminderViewModel,
) {
    val model by sedentaryViewModel.state.collectAsStateWithLifecycle()
    var showSedentarySheet by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        sedentaryViewModel.dispatch(SedentaryReminderUiAction.NotificationPermissionResult(granted))
    }

    LaunchedEffect(model.requestNotificationPermission) {
        if (!model.requestNotificationPermission) return@LaunchedEffect
        sedentaryViewModel.dispatch(SedentaryReminderUiAction.NotificationPermissionRequestConsumed)
        if (Build.VERSION.SDK_INT >= 33) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            sedentaryViewModel.dispatch(SedentaryReminderUiAction.NotificationPermissionResult(true))
        }
    }

    MaterialTheme {
        Box(Modifier.fillMaxSize()) {
            HealthApp(healthViewModel)
            FloatingActionButton(
                onClick = { showSedentarySheet = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 20.dp, bottom = 82.dp),
            ) {
                Text("久坐")
            }
        }

        if (showSedentarySheet) {
            ModalBottomSheet(onDismissRequest = { showSedentarySheet = false }) {
                SedentaryReminderPanel(
                    model = model,
                    dispatch = sedentaryViewModel::dispatch,
                )
            }
        }
    }
}

@Composable
private fun SedentaryReminderPanel(
    model: SedentaryReminderUiModel,
    dispatch: (SedentaryReminderUiAction) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 22.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("久坐提醒", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text("仅根据合格、最新且能证明连续静止区段的 activity 数据提醒；缺失、日累计或过期数据不会触发。")

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SettingSwitch(
                    title = "启用提醒",
                    subtitle = if (model.activation is Activation.Active) {
                        "每 15 分钟由 WorkManager 进行机会性检查"
                    } else {
                        "健康发布门禁未通过，设置会保存但后台任务保持取消"
                    },
                    checked = model.settings.enabled,
                    enabled = !model.busy,
                    onChecked = { dispatch(SedentaryReminderUiAction.SetEnabled(it)) },
                )
                HorizontalDivider()
                Text("连续久坐阈值", fontWeight = FontWeight.Medium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(45, 60, 90).forEach { minutes ->
                        FilterChip(
                            selected = model.settings.thresholdMinutes == minutes,
                            onClick = { dispatch(SedentaryReminderUiAction.SetThreshold(minutes)) },
                            label = { Text("$minutes 分钟") },
                            enabled = !model.busy,
                        )
                    }
                }
                SettingSwitch(
                    title = "夜间免打扰",
                    subtitle = "22:00-07:00 不发布提醒",
                    checked = model.settings.quietHours != null,
                    enabled = !model.busy,
                    onChecked = { dispatch(SedentaryReminderUiAction.SetQuietHoursEnabled(it)) },
                )
            }
        }

        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("运行状态", fontWeight = FontWeight.Medium)
                Text(if (model.notificationPermissionGranted) "通知权限：已授予" else "通知权限：未授予")
                model.reminderState.lastDeliveredAt?.let { at ->
                    Text("上次提醒：${formatEpochMillis(at.value)} · ${model.reminderState.lastDeliveredSedentaryMinutes ?: 0} 分钟")
                } ?: Text("上次提醒：无")
                model.reminderState.snoozedUntil?.let { until ->
                    Text("已暂停至：${formatEpochMillis(until.value)}")
                }
                model.message?.let { message ->
                    Text(message, color = MaterialTheme.colorScheme.primary)
                }
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = { dispatch(SedentaryReminderUiAction.CheckNow) },
                enabled = !model.busy,
                modifier = Modifier.weight(1f),
            ) { Text("立即检查") }
            OutlinedButton(
                onClick = { dispatch(SedentaryReminderUiAction.SnoozeThirtyMinutes) },
                enabled = !model.busy && model.settings.enabled,
                modifier = Modifier.weight(1f),
            ) { Text("暂停 30 分钟") }
        }
        if (!model.notificationPermissionGranted) {
            TextButton(
                onClick = { dispatch(SedentaryReminderUiAction.RequestNotificationPermission) },
                enabled = model.activation is Activation.Active,
                modifier = Modifier.align(Alignment.End),
            ) { Text("授予通知权限") }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun SettingSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onChecked: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
        }
        Switch(checked = checked, onCheckedChange = onChecked, enabled = enabled)
    }
}

private fun formatEpochMillis(value: Long): String = DateTimeFormatter.ofPattern("MM-dd HH:mm")
    .format(Instant.ofEpochMilli(value).atZone(ZoneId.systemDefault()))
