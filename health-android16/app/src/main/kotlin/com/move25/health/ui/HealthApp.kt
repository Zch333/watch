package com.move25.health.ui

import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.move25.health.domain.*

@Composable
fun HealthApp(viewModel: HealthViewModel) {
    val model by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val exportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        PendingExport.artifact?.let { artifact -> context.contentResolver.openOutputStream(uri)?.use { it.write(artifact.bytes) } }
        PendingExport.artifact = null
    }
    LaunchedEffect(Unit) {
        UiEventBus.flow.collect { event -> if (event is UiEvent.Export) {
            PendingExport.artifact = event.artifact
            exportLauncher.launch(event.artifact.displayName)
        } }
    }
    Move25Theme {
        BackHandler(enabled = model.section != AppSection.TODAY) { viewModel.dispatch(HealthUiAction.SelectSection(AppSection.TODAY)) }
        HealthScaffold(model, viewModel::dispatch)
    }
}

private object PendingExport { @Volatile var artifact: com.move25.health.ports.ExportArtifact? = null }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HealthScaffold(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) {
    val wide = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp >= 840
    val content: @Composable (PaddingValues) -> Unit = { padding ->
        Row(Modifier.fillMaxSize().padding(padding)) {
            if (wide) NavigationRail {
                AppSection.entries.forEach { section -> NavigationRailItem(selected = model.section == section,
                    onClick = { dispatch(HealthUiAction.SelectSection(section)) }, icon = { Text(section.shortLabel.take(1)) }, label = { Text(section.shortLabel) }) }
            }
            Box(Modifier.weight(1f).fillMaxHeight()) { Section(model, dispatch) }
        }
    }
    Scaffold(
        topBar = { TopAppBar(title = { Text("Move25 健康", fontWeight = FontWeight.SemiBold) }, actions = {
            StatusPill(model.activation)
        }) },
        bottomBar = { if (!wide) NavigationBar {
            AppSection.entries.forEach { section -> NavigationBarItem(selected = model.section == section,
                onClick = { dispatch(HealthUiAction.SelectSection(section)) }, icon = { Text(section.shortLabel.take(1)) }, label = { Text(section.shortLabel) }) }
        } },
        snackbarHost = { model.message?.let { MessageBar(it) { dispatch(HealthUiAction.DismissMessage) } } },
        content = content,
    )
    if (model.deleteConfirmationVisible) AlertDialog(
        onDismissRequest = { dispatch(HealthUiAction.CancelDelete) },
        title = { Text("删除全部健康数据？") },
        text = { Text("将撤销同意、写入删除墓碑并清除本机派生结果。此操作不可撤销；配置后端后还会请求云端删除。") },
        confirmButton = { TextButton(onClick = { dispatch(HealthUiAction.ConfirmDelete) }) { Text("确认删除") } },
        dismissButton = { TextButton(onClick = { dispatch(HealthUiAction.CancelDelete) }) { Text("取消") } },
    )
}

@Composable private fun MessageBar(text: String, dismiss: () -> Unit) {
    Snackbar(action = { TextButton(onClick = dismiss) { Text("知道了") } }) { Text(text) }
}

@Composable private fun StatusPill(activation: Activation) {
    val label = if (activation is Activation.Active) "已激活" else "未启用"
    AssistChip(onClick = {}, label = { Text(label) })
}

@Composable private fun Section(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = when (model.section) {
    AppSection.TODAY -> TodayScreen(model, dispatch)
    AppSection.DATA -> DataScreen(model, dispatch)
    AppSection.REPORTS -> ReportScreen(model, dispatch)
    AppSection.AI -> AgentScreen(model, dispatch)
    AppSection.DEVICES -> DeviceScreen(model, dispatch)
    AppSection.PRIVACY -> PrivacyScreen(model, dispatch)
}

@Composable private fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Column(content = content) }
    }
}

@Composable private fun TodayScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = ScreenColumn {
    Text("今日概览", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(10.dp))
    DormantCard(model)
    Spacer(Modifier.height(14.dp))
    if (model.metrics.isEmpty()) EmptyState("暂无健康指标", "总门禁开启、用户同意且平台能力验证后，合格指标会显示在这里。")
    else model.metrics.chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        row.forEach { MetricCard(it, Modifier.weight(1f)) }
        if (row.size == 1) Spacer(Modifier.weight(1f))
    } }
    Spacer(Modifier.height(14.dp))
    Button(enabled = !model.busy, onClick = { dispatch(HealthUiAction.SyncNow) }) { Text("立即同步") }
    Text(WELLNESS_DISCLAIMER, style = MaterialTheme.typography.bodySmall)
}

@Composable private fun DormantCard(model: HealthUiModel) {
    ElevatedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (model.activation is Activation.Active) "健康监测已激活" else "健康能力处于休眠状态", style = MaterialTheme.typography.titleLarge)
        Text(activationReason(model.activation))
        if (!model.releaseEnabled) Text("发布总开关为 false：不会授权、采集、同步、调用 AI 或启动手表会话。")
    } }
}

@Composable private fun MetricCard(tile: MetricTile, modifier: Modifier = Modifier) {
    ElevatedCard(modifier) { Column(Modifier.padding(16.dp)) {
        Text(tile.label, style = MaterialTheme.typography.labelLarge)
        Text("${tile.value} ${tile.unit}", style = MaterialTheme.typography.headlineSmall)
        Text(tile.status, style = MaterialTheme.typography.bodySmall)
    } }
}

@Composable private fun DataScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = ScreenColumn {
    Text("健康时间线", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(8.dp))
    Text("所有观测均携带来源、质量、同意和版本；被拒绝的数据不会进入报告。")
    Spacer(Modifier.height(14.dp))
    if (model.metrics.isEmpty()) EmptyState("暂无合格数据", "历史数据来自用户授权后的 Huawei Health；实时能力需单独的 Wear Engine/扩展权限。")
    else model.metrics.forEach { MetricCard(it, Modifier.fillMaxWidth()) }
    OutlinedButton(onClick = { dispatch(HealthUiAction.SyncNow) }) { Text("增量同步") }
    Spacer(Modifier.height(18.dp))
    Text("手工与外部设备记录", style = MaterialTheme.typography.titleLarge)
    Text("情绪、女性健康、外部血压/血糖只做时间线整合，不由手表估算。")
    OutlinedButton(onClick = { dispatch(HealthUiAction.EnableManualEntries) }) { Text("授权手工记录") }
    ManualEntryPanel(dispatch)
}

@Composable private fun ManualEntryPanel(dispatch: (HealthUiAction) -> Unit) {
    var mood by remember { mutableStateOf("") }
    var cycle by remember { mutableStateOf("") }
    var glucose by remember { mutableStateOf("") }
    var systolic by remember { mutableStateOf("") }
    var diastolic by remember { mutableStateOf("") }
    OutlinedTextField(mood, { mood = it }, Modifier.fillMaxWidth(), label = { Text("情绪标签") })
    TextButton(onClick = { dispatch(HealthUiAction.RecordManual(ObservationKind.MOOD, mood)) }) { Text("保存情绪") }
    OutlinedTextField(cycle, { cycle = it }, Modifier.fillMaxWidth(), label = { Text("女性健康记录（如经期开始/结束）") })
    TextButton(onClick = { dispatch(HealthUiAction.RecordManual(ObservationKind.MENSTRUAL_CYCLE, cycle)) }) { Text("保存女性健康记录") }
    OutlinedTextField(glucose, { glucose = it }, Modifier.fillMaxWidth(), label = { Text("外部血糖 mmol/L") })
    TextButton(onClick = { dispatch(HealthUiAction.RecordManual(ObservationKind.EXTERNAL_BLOOD_GLUCOSE, glucose)) }) { Text("保存外部血糖") }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(systolic, { systolic = it }, Modifier.weight(1f), label = { Text("收缩压") })
        OutlinedTextField(diastolic, { diastolic = it }, Modifier.weight(1f), label = { Text("舒张压") })
    }
    TextButton(onClick = { dispatch(HealthUiAction.RecordManual(ObservationKind.EXTERNAL_BLOOD_PRESSURE, systolic, diastolic)) }) { Text("保存外部血压") }
}

@Composable private fun ReportScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = ScreenColumn {
    Text("洞察与报告", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(8.dp))
    Text("日、周、月报告由确定性算法生成，AI 只负责解释，不负责计算或医学判定。")
    Spacer(Modifier.height(14.dp))
    listOf(Triple("日报", "daily", "当天活动、睡眠与恢复摘要"), Triple("周报", "weekly", "七天个人基线、趋势与持续变化"), Triple("月报", "monthly", "长期分布、相关性假设与 N-of-1 回顾")).forEach { (title, period, body) ->
        OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold); Text(body)
            TextButton(enabled = !model.busy, onClick = { dispatch(HealthUiAction.GenerateReport(period)) }) { Text("生成$title") }
        } }
        Spacer(Modifier.height(10.dp))
    }
    model.report?.let { report ->
        Text("${report.period} 报告", style = MaterialTheme.typography.titleLarge)
        if (report.summaries.isEmpty()) EmptyState("没有合格指标", "被拒绝或缺失的数据不会被补齐成报告。")
        else report.summaries.forEach { MetricCard(it, Modifier.fillMaxWidth()) }
        Text("生成器：${report.generatedBy}", style = MaterialTheme.typography.labelSmall)
        Text(report.limitation, style = MaterialTheme.typography.bodySmall)
    }
    Text("相关不等于因果；单次异常不自动形成结论。", style = MaterialTheme.typography.bodySmall)
}

@Composable private fun AgentScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) {
    var prompt by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("AI 健康助手", style = MaterialTheme.typography.headlineMedium)
        Text("优先使用 Gemini Nano；不可用时只显示确定性报告。AI 不接触原始高频信号。")
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 14.dp)) {
            if (model.chat.isEmpty()) item { EmptyState("还没有对话", "可询问“解释我最近的恢复趋势”。未激活时不会调用模型。") }
            items(model.chat, key = ChatBubble::id) { bubble -> Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) {
                Text(if (bubble.role == "user") "你" else "健康助手", fontWeight = FontWeight.Bold)
                Text(bubble.text); bubble.model?.let { Text(it, style = MaterialTheme.typography.labelSmall) }
            } } }
        }
        OutlinedTextField(prompt, { prompt = it }, Modifier.fillMaxWidth(), label = { Text("询问已验证的健康趋势") }, maxLines = 3)
        Spacer(Modifier.height(8.dp))
        Button(enabled = !model.busy && prompt.isNotBlank(), onClick = { dispatch(HealthUiAction.AskAgent(prompt)); prompt = "" }, modifier = Modifier.align(Alignment.End)) { Text("发送") }
    }
}

@Composable private fun DeviceScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = ScreenColumn {
    Text("HUAWEI WATCH GT 6", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(8.dp))
    Text("GT 6 为 Lite Wearable API 20：历史健康数据经 Huawei Health；短时传感器和 P2P 经 Wear Engine。不会调用 API 24 的手表 Health Store。")
    Spacer(Modifier.height(14.dp))
    CapabilityList(model.capabilities)
    if (model.devices.isNotEmpty()) model.devices.forEach { device -> ListItem(
        headlineContent = { Text(device.name) },
        supportingContent = { Text("${device.model} · ${device.state} · 电量 ${device.battery}") },
    ) }
    OutlinedButton(enabled = !model.busy, onClick = { dispatch(HealthUiAction.RefreshCapabilities) }) { Text("检查能力（不会授权）") }
    model.realtimeHeartRate?.let { Text("当前会话心率：$it", style = MaterialTheme.typography.titleLarge) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(enabled = !model.busy, onClick = { dispatch(HealthUiAction.StartRealtimeHeartRate) }) { Text("开始 5 分钟实时心率") }
        TextButton(onClick = { dispatch(HealthUiAction.StopRealtimeHeartRate) }) { Text("停止") }
    }
    Spacer(Modifier.height(14.dp))
    Text("数据组授权", style = MaterialTheme.typography.titleLarge)
    huaweiDataPlan.forEach { group -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(group.id, fontWeight = FontWeight.SemiBold); Text(group.channel.name, style = MaterialTheme.typography.bodySmall) }
        TextButton(onClick = { dispatch(HealthUiAction.AuthorizeGroup(group.id)) }) { Text("授权") }
        TextButton(onClick = { dispatch(HealthUiAction.RevokeGroup(group.id)) }) { Text("撤销") }
    } }
}

@Composable private fun CapabilityList(capabilities: Map<String, Capability>) {
    if (capabilities.isEmpty()) EmptyState("能力尚未验证", "实际型号、固件、地区、Scope 与审批结果必须逐项探测。")
    capabilities.toSortedMap().forEach { (id, state) -> ListItem(headlineContent = { Text(id) }, supportingContent = { Text(capabilityLabel(state)) }) }
}

private fun capabilityLabel(value: Capability) = when (value) {
    Capability.Unknown -> "未知"
    is Capability.Available -> "可用"
    is Capability.RequiresPermission -> "需要用户授权"
    is Capability.RequiresApproval -> "需要平台审批：${value.service}"
    is Capability.Unsupported -> "不支持：${value.reason}"
    is Capability.TemporarilyUnavailable -> "暂时不可用：${value.reason}"
}

@Composable private fun PrivacyScreen(model: HealthUiModel, dispatch: (HealthUiAction) -> Unit) = ScreenColumn {
    Text("隐私、授权与功能开关", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(8.dp))
    SwitchRow("健康监测偏好", "总发布门禁关闭时，打开此项也不会开始采集。", model.userEnabled) { dispatch(HealthUiAction.SetHealthEnabled(it)) }
    SwitchRow("AI 解释", "只处理最小化、已验证的摘要；不会把模型密钥写入 APK。", model.aiEnabled) { dispatch(HealthUiAction.SetAiEnabled(it)) }
    SwitchRow("Android 系统智能工具", "只公开聚合摘要；默认关闭，不公开删除、授权或原始数据。", model.appFunctionsEnabled) { dispatch(HealthUiAction.SetAppFunctionsEnabled(it)) }
    Spacer(Modifier.height(12.dp))
    OutlinedButton(onClick = { dispatch(HealthUiAction.ExportData) }) { Text("导出我的数据") }
    TextButton(onClick = { dispatch(HealthUiAction.DeleteData) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("删除全部健康数据") }
    Text("本地敏感载荷使用 Android Keystore AES-256-GCM 加密；健康数据库不进入系统备份。", style = MaterialTheme.typography.bodySmall)
}

@Composable private fun SwitchRow(title: String, body: String, checked: Boolean, changed: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold); Text(body, style = MaterialTheme.typography.bodySmall) }
        Switch(checked, changed)
    }
    Spacer(Modifier.height(14.dp))
}

@Composable private fun EmptyState(title: String, body: String) {
    OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) { Text(title, fontWeight = FontWeight.Bold); Text(body) } }
}

@Composable private fun Move25Theme(content: @Composable () -> Unit) {
    val scheme = lightColorScheme(primary = androidx.compose.ui.graphics.Color(0xFF176B52), secondary = androidx.compose.ui.graphics.Color(0xFF4E6359),
        background = androidx.compose.ui.graphics.Color(0xFFF7FAF7), surface = androidx.compose.ui.graphics.Color(0xFFF7FAF7))
    MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
}
