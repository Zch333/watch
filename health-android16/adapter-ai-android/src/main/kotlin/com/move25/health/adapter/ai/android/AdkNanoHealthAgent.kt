package com.move25.health.adapter.ai.android

import com.google.adk.kt.agents.Instruction
import com.google.adk.kt.agents.LlmAgent
import com.google.adk.kt.agents.RunConfig
import com.google.adk.kt.agents.StreamingMode
import com.google.adk.kt.mlkit.GenaiPrompt
import com.google.adk.kt.mlkit.GenerativeModelHelpers
import com.google.adk.kt.runners.InMemoryRunner
import com.google.adk.kt.sessions.InMemorySessionService
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Role
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class AdkNanoHealthAgent : LocalAgentPort {
    override suspend fun capability(): Capability = runCatching {
        when (Generation.getClient().checkStatus()) {
            FeatureStatus.AVAILABLE -> Capability.Available(mapOf("model" to "Gemini Nano", "runtime" to "AICore/ML Kit"))
            FeatureStatus.DOWNLOADABLE -> Capability.Available(mapOf(
                "model" to "Gemini Nano",
                "runtime" to "AICore/ML Kit",
                "initialization" to "MODEL_DOWNLOAD_REQUIRED_ON_FIRST_USER_REQUEST",
            ))
            FeatureStatus.DOWNLOADING -> Capability.TemporarilyUnavailable("GEMINI_NANO_DOWNLOADING")
            else -> Capability.Unsupported("GEMINI_NANO_UNAVAILABLE_ON_DEVICE")
        }
    }.getOrElse { Capability.TemporarilyUnavailable("AICORE_STATUS_FAILED:${it.message}") }

    override fun stream(request: AgentRequest): Flow<Result<DomainError, AgentChunk>> = flow {
        if (request.prompt.isBlank()) {
            emit(Result.Err(DomainError("AGENT_PROMPT_REQUIRED")))
            return@flow
        }
        if (capability() !is Capability.Available) {
            emit(Result.Err(DomainError("LOCAL_AGENT_UNAVAILABLE")))
            return@flow
        }
        try {
            val agent = LlmAgent(
                name = AGENT_NAME,
                model = GenaiPrompt.create(GenerativeModelHelpers.initGenerativeModel(), name = "gemini-nano"),
                instruction = Instruction(INSTRUCTION),
            )
            val runner = InMemoryRunner(agent = agent, appName = APP_NAME, sessionService = InMemorySessionService())
            val groundedPrompt = buildString {
                appendLine("用户问题：${request.prompt}")
                appendLine()
                appendLine("以下是应用的确定性引擎已经计算并验证的唯一事实来源：")
                append(renderDeterministicReport(request.verifiedReport))
            }
            runner.runAsync(
                userId = request.subjectId.value,
                sessionId = request.sessionId,
                newMessage = Content(role = Role.USER, parts = listOf(Part(text = groundedPrompt))),
                runConfig = RunConfig(streamingMode = StreamingMode.SSE),
            ).collect { event ->
                if (event.author == AGENT_NAME) {
                    val text = event.content?.parts.orEmpty().filter { it.thought != true }.mapNotNull { it.text }.joinToString("")
                    if (text.isNotBlank()) emit(Result.Ok(AgentChunk(text, event.partial, "gemini-nano")))
                }
            }
        } catch (failure: Throwable) {
            emit(Result.Err(DomainError("LOCAL_AGENT_FAILED", failure.message)))
        }
    }

    private companion object {
        const val APP_NAME = "Move25HealthLocalAgent"
        const val AGENT_NAME = "move25_wellness_agent"
        val INSTRUCTION = """
            You explain a deterministic personal wellness report in concise Chinese.
            The app injects the already verified report into every user turn. Use only that report.
            Never diagnose, predict disease, alter medication, invent a number, or exceed input confidence.
            State that correlation is not causation. Preserve every red flag and limitation.
            If evidence is missing, say it is unavailable. Do not request identity or raw sensor data.
        """.trimIndent()
    }
}

private fun renderDeterministicReport(report: DeterministicReport): String = buildString {
    appendLine("标题：${report.title}")
    appendLine("置信度：${report.confidence.name}")
    report.observations.forEach { appendLine("已验证观察：$it") }
    report.actions.forEach { appendLine("允许的低风险行动：$it") }
    report.redFlags.forEach { appendLine("必须原样保留的红旗：$it") }
    report.limitations.forEach { appendLine("必须保留的限制：$it") }
}
