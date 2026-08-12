package com.move25.health.adapter.ai.android

import android.content.Context
import com.google.adk.firebase.models.Firebase
import com.google.adk.kt.agents.*
import com.google.adk.kt.runners.InMemoryRunner
import com.google.adk.kt.sessions.InMemorySessionService
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Role
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.appcheck.FirebaseAppCheck
import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/** Firebase AI Logic cloud route. App Check must be configured by the release composition root. */
class FirebaseAdkHealthAgent(
    context: Context,
    private val modelName: String,
    private val appCheckEvidence: () -> Boolean,
) : CloudAgentPort {
    private val appContext = context.applicationContext

    override suspend fun capability(): Capability = when {
        FirebaseApp.getApps(appContext).isEmpty() -> Capability.Unsupported("FIREBASE_APP_NOT_CONFIGURED")
        !appCheckEvidence() -> Capability.RequiresApproval("FIREBASE_APP_CHECK_RELEASE_EVIDENCE")
        else -> runCatching {
            FirebaseAppCheck.getInstance(FirebaseApp.getInstance())
            Capability.Available(mapOf("model" to modelName, "transport" to "Firebase AI Logic"))
        }.getOrElse { Capability.TemporarilyUnavailable("FIREBASE_AI_STATUS_FAILED:${it.message}") }
    }

    override fun stream(request: AgentRequest): Flow<Result<DomainError, AgentChunk>> = flow {
        if (capability() !is Capability.Available) {
            emit(Result.Err(DomainError("FIREBASE_AI_NOT_AVAILABLE")))
            return@flow
        }
        try {
            val firebaseApp = FirebaseApp.getInstance()
            val agent = LlmAgent(
                name = AGENT_NAME,
                model = Firebase.create(modelName, FirebaseAI.getInstance(firebaseApp)),
                instruction = Instruction(INSTRUCTION),
                tools = HealthAgentTools(request.verifiedReport).generatedTools(),
            )
            val runner = InMemoryRunner(agent = agent, appName = APP_NAME, sessionService = InMemorySessionService())
            runner.runAsync(
                userId = request.subjectId.value,
                sessionId = request.sessionId,
                newMessage = Content(role = Role.USER, parts = listOf(Part(text = request.prompt))),
                runConfig = RunConfig(streamingMode = StreamingMode.SSE),
            ).collect { event ->
                if (event.author == AGENT_NAME) {
                    val text = event.content?.parts.orEmpty().filter { it.thought != true }.mapNotNull { it.text }.joinToString("")
                    if (text.isNotBlank()) emit(Result.Ok(AgentChunk(text, event.partial, modelName)))
                }
            }
        } catch (failure: Throwable) {
            emit(Result.Err(DomainError("FIREBASE_AI_AGENT_FAILED", failure.message)))
        }
    }

    private companion object {
        const val APP_NAME = "Move25HealthFirebaseAgent"
        const val AGENT_NAME = "move25_cloud_wellness_agent"
        val INSTRUCTION = """
            Explain only the deterministic wellness summary returned by get_verified_health_summary.
            Do not diagnose, predict disease, recommend medication changes, invent numbers, or omit limitations and red flags.
            Prefer short, actionable, low-risk Chinese language. Correlation is not causation.
        """.trimIndent()
    }
}
