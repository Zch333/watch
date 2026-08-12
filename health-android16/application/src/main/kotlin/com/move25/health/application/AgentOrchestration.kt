package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

enum class AgentRoute { DETERMINISTIC_ONLY, ON_DEVICE, CLOUD }

data class AgentPolicyInput(
    val healthActive: Boolean,
    val aiConsent: Boolean,
    val preferOnDevice: Boolean,
    val localCapability: Capability,
    val cloudCapability: Capability,
    val containsRedFlag: Boolean,
)

fun chooseAgentRoute(input: AgentPolicyInput): AgentRoute = when {
    !input.healthActive || !input.aiConsent || input.containsRedFlag -> AgentRoute.DETERMINISTIC_ONLY
    input.preferOnDevice && input.localCapability is Capability.Available -> AgentRoute.ON_DEVICE
    input.cloudCapability is Capability.Available -> AgentRoute.CLOUD
    input.localCapability is Capability.Available -> AgentRoute.ON_DEVICE
    else -> AgentRoute.DETERMINISTIC_ONLY
}

class RunHealthAgentUseCase(
    private val local: LocalAgentPort,
    private val cloud: CloudAgentPort?,
) {
    suspend fun capability(): Pair<Capability, Capability> = local.capability() to (cloud?.capability() ?: Capability.Unsupported("CLOUD_AGENT_NOT_CONFIGURED"))

    fun run(route: AgentRoute, request: AgentRequest): Flow<Result<DomainError, AgentChunk>> = when (route) {
        AgentRoute.ON_DEVICE -> verified(local.stream(request), request.verifiedReport)
        AgentRoute.CLOUD -> cloud?.let { verified(it.stream(request), request.verifiedReport) }
            ?: flow { emit(Result.Err(DomainError("CLOUD_AGENT_NOT_CONFIGURED"))) }
        AgentRoute.DETERMINISTIC_ONLY -> flow {
            emit(Result.Ok(AgentChunk(
                buildString {
                    append(request.verifiedReport.title)
                    request.verifiedReport.observations.forEach { append("\n").append(it) }
                    request.verifiedReport.actions.forEach { append("\n建议：").append(it) }
                    request.verifiedReport.redFlags.forEach { append("\n").append(it) }
                    request.verifiedReport.limitations.forEach { append("\n限制：").append(it) }
                }, false, "deterministic-template/1.0.0")))
        }
    }

    private fun verified(source: Flow<Result<DomainError, AgentChunk>>, report: DeterministicReport): Flow<Result<DomainError, AgentChunk>> = flow {
        val accumulated = StringBuilder()
        var model = "unknown"
        try {
            source.collect { result -> when (result) {
                is Result.Err -> emit(result)
                is Result.Ok -> {
                    model = result.value.model
                    if (result.value.partial) accumulated.append(result.value.text)
                    else {
                        val candidate = result.value.text.ifBlank { accumulated.toString() }
                        emit(validateAgentNarrative(candidate, report).map { AgentChunk(it, false, model) })
                    }
                }
            } }
        } catch (failure: Throwable) {
            emit(Result.Err(DomainError("AGENT_ORCHESTRATION_FAILED", failure.message)))
        }
    }
}
